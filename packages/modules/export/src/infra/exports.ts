import { highlightMarks } from "@app/annotation";
import { deckDocuments, documentOriginal, type DeckDocument } from "@app/library";
import { nodePages, summaryNodes } from "@app/outline";
import { ankiGuid, deckName, liveFlashcards } from "@app/study";
import {
  DomainError,
  enqueueJob,
  newId,
  notFound,
  withUser,
  type Db,
  type ObjectStorage,
} from "@app/platform";
import { and, eq, sql } from "drizzle-orm";
import { generateApkg } from "../apkg/generate";
import { annotatePdf } from "../annotated/annotate";
import { CLASSIC_TEMPLATE, renderClassicSummary } from "../templates/classic";
import type { SafeHtml } from "../render/html";
import type { ApkgNote } from "../apkg/types";
import type { Export, ExportKind, ExportScope } from "../domain/export";
import { exports } from "./schema";

const DOWNLOAD_URL_SECONDS = 300;

export type ExportRequest = { kind: ExportKind; scope: ExportScope; scopeId: string };
export type ExportStatusView = {
  id: string;
  status: Export["status"];
  error: Export["error"];
  downloadUrl?: string;
};

const invalid = (message: string): DomainError =>
  new DomainError("VALIDATION_FAILED", message, 400);

const EXTENSION = { FLASHCARDS_APKG: "apkg", SUMMARY_PDF: "pdf", ANNOTATED_PDF: "pdf" } as const;
type BuiltKind = keyof typeof EXTENSION;
const isBuilt = (kind: string): kind is BuiltKind => kind in EXTENSION;

const resultKeyFor = (ownerId: string, exportId: string, kind: BuiltKind): string =>
  `${ownerId}/exports/${exportId}.${EXTENSION[kind]}`;

const tag = (text: string): string => text.trim().replaceAll(/\s+/g, "_");

/** Flashcard decks as exports: request, status and the job that builds the package (`export/apkg`). */
export function createExports(deps: {
  db: Db;
  storage: ObjectStorage;
  /** Turns the summary HTML into a PDF; only the worker needs it. */
  renderPdf?: (document: SafeHtml) => Promise<Uint8Array>;
}) {
  const { db, storage } = deps;

  const documentsOf = async (
    tx: Parameters<typeof deckDocuments>[0],
    ownerId: string,
    scope: ExportScope,
    scopeId: string,
  ): Promise<DeckDocument[]> => {
    const found = await deckDocuments(tx, ownerId, {
      kind: scope === "DOCUMENT" ? "document" : "subject",
      id: scopeId,
    });
    if (!found) throw notFound("export scope");
    return found;
  };

  async function collectNotes(
    tx: Parameters<typeof deckDocuments>[0],
    ownerId: string,
    scope: ExportScope,
    scopeId: string,
  ): Promise<ApkgNote[]> {
    const documents = await documentsOf(tx, ownerId, scope, scopeId);
    const byId = new Map(documents.map((d) => [d.documentId, d]));
    const cards = await liveFlashcards(tx, ownerId, [...byId.keys()]);
    const pages = await nodePages(
      tx,
      ownerId,
      cards.flatMap((c) => (c.sourceNodeId ? [c.sourceNodeId] : [])),
    );
    return cards.map((card) => {
      const document = byId.get(card.documentId)!;
      const page = card.sourceNodeId ? pages.get(card.sourceNodeId) : undefined;
      const source = `${document.subjectName} › ${document.title}`;
      return {
        guid: ankiGuid(card.id),
        deck: deckName(document.subjectName, document.title),
        front: card.front,
        back: card.back,
        source: page === undefined ? source : `${source}, p. ${page + 1}`,
        tags: [
          ...new Set([
            tag(document.subjectName),
            tag(document.title),
            ...(page === undefined ? [] : [`page_${page + 1}`]),
          ]),
        ],
        modifiedAt: card.updatedAt,
      };
    });
  }

  type Built = { bytes: Uint8Array; contentType: string };

  /** Reads everything the file needs inside the caller's transaction; the slow part is the returned function. */
  async function prepare(
    tx: Parameters<typeof deckDocuments>[0],
    ownerId: string,
    kind: BuiltKind,
    scope: ExportScope,
    scopeId: string,
  ): Promise<() => Promise<Built>> {
    if (kind === "FLASHCARDS_APKG") {
      const notes = await collectNotes(tx, ownerId, scope, scopeId);
      return async () => ({
        bytes: await generateApkg(notes),
        contentType: "application/octet-stream",
      });
    }
    if (kind === "ANNOTATED_PDF") {
      const original = await documentOriginal(tx, ownerId, scopeId);
      if (!original) throw notFound("document");
      if (Object.values(original.riskFlags).some((count) => (count ?? 0) > 0)) {
        throw new DomainError(
          "EXPORT_ACTIVE_CONTENT",
          "The document has active content, which an exported file must not carry",
          422,
        );
      }
      const marks = await highlightMarks(tx, ownerId, scopeId);
      return async () => ({
        bytes: await annotatePdf(await storage.get("originals", original.storageKey), marks),
        contentType: "application/pdf",
      });
    }
    const documents = await documentsOf(tx, ownerId, scope, scopeId);
    const nodes = await summaryNodes(
      tx,
      ownerId,
      documents.map((d) => d.documentId),
    );
    const template = {
      footer: scope === "DOCUMENT" ? documents[0]!.title : (documents[0]?.subjectName ?? ""),
      documents: documents.map((d) => ({ title: d.title, nodes: nodes.get(d.documentId) ?? [] })),
    };
    return async () => {
      if (!deps.renderPdf) throw new Error("This process has no PDF renderer");
      return {
        bytes: await deps.renderPdf(renderClassicSummary(template)),
        contentType: "application/pdf",
      };
    };
  }

  const finish = (ownerId: string, exportId: string, set: Partial<typeof exports.$inferInsert>) =>
    withUser(db, ownerId, (tx) =>
      tx
        .update(exports)
        .set({ ...set, updatedAt: new Date() })
        .where(and(eq(exports.ownerId, ownerId), eq(exports.id, exportId))),
    );

  return {
    async request(ownerId: string, input: ExportRequest): Promise<{ id: string }> {
      if (!isBuilt(input.kind)) throw invalid("This kind of export is not available");
      if (input.scope !== "DOCUMENT" && input.scope !== "SUBJECT") {
        throw invalid("An export is made for a DOCUMENT or a SUBJECT");
      }
      if (input.kind === "ANNOTATED_PDF" && input.scope !== "DOCUMENT") {
        throw invalid("An annotated PDF is exported for a DOCUMENT");
      }
      const id = newId();
      await withUser(db, ownerId, async (tx) => {
        if (input.kind === "ANNOTATED_PDF") {
          if (!(await documentOriginal(tx, ownerId, input.scopeId))) throw notFound("document");
        } else {
          await documentsOf(tx, ownerId, input.scope, input.scopeId);
        }
        const [cursor] = await tx
          .execute<{ seq: string }>(
            sql`select coalesce(max(seq), 0)::text as seq from platform.change_log where owner_id = ${ownerId}`,
          )
          .then((r) => r.rows);
        await tx.insert(exports).values({
          id,
          ownerId,
          kind: input.kind,
          scope: input.scope,
          scopeId: input.scopeId,
          ...(input.kind === "SUMMARY_PDF"
            ? { templateId: CLASSIC_TEMPLATE.id, templateVersion: CLASSIC_TEMPLATE.version }
            : {}),
          snapshotCursor: Number(cursor?.seq ?? 0),
        });
        await enqueueJob(
          tx,
          "export.render",
          { ownerId, exportId: id },
          { jobKey: `export.render:${id}` },
        );
      });
      return { id };
    },

    async get(ownerId: string, id: string): Promise<ExportStatusView> {
      const row = await withUser(db, ownerId, async (tx) => {
        const [found] = await tx
          .select()
          .from(exports)
          .where(and(eq(exports.ownerId, ownerId), eq(exports.id, id)));
        if (!found || found.deletedAt) throw notFound("export");
        const name =
          found.status === "SUCCEEDED" && found.scopeId
            ? (
                await deckDocuments(tx, ownerId, {
                  kind: found.scope === "DOCUMENT" ? "document" : "subject",
                  id: found.scopeId,
                })
              )?.[0]
            : undefined;
        return {
          found,
          name: name ? (found.scope === "DOCUMENT" ? name.title : name.subjectName) : "flashcards",
        };
      });
      const { found, name } = row;
      const view: ExportStatusView = { id, status: found.status, error: found.error };
      if (found.status === "SUCCEEDED" && found.resultKey) {
        view.downloadUrl = await storage.presignGet("derived", found.resultKey, {
          expiresInSeconds: DOWNLOAD_URL_SECONDS,
          downloadName: `${(found.kind === "ANNOTATED_PDF" ? `${name} (marcado)` : name).replaceAll(/[^\p{L}\p{N} _()-]/gu, "")}.${
            found.resultKey.endsWith(".pdf") ? "pdf" : "apkg"
          }`,
        });
      }
      return view;
    },

    /**
     * The `export.render` job. An unexpected failure throws so the queue retries; on the last
     * attempt it ends the export as `FAILED` instead (ADR 0020).
     */
    async run(ownerId: string, exportId: string, opts: { lastAttempt: boolean }): Promise<void> {
      try {
        const job = await withUser(db, ownerId, async (tx) => {
          const [row] = await tx
            .select()
            .from(exports)
            .where(and(eq(exports.ownerId, ownerId), eq(exports.id, exportId)));
          if (!row || row.deletedAt || row.status === "SUCCEEDED" || !row.scopeId) return null;
          if (!isBuilt(row.kind)) throw new Error(`${row.kind} exports are not built`);
          await tx
            .update(exports)
            .set({ status: "RUNNING", updatedAt: new Date() })
            .where(eq(exports.id, exportId));
          return {
            kind: row.kind,
            build: await prepare(tx, ownerId, row.kind, row.scope, row.scopeId),
          };
        });
        if (job === null) return;

        const key = resultKeyFor(ownerId, exportId, job.kind);
        const built = await job.build();
        await storage.put("derived", key, built.bytes, built.contentType);
        const now = new Date();
        await finish(ownerId, exportId, {
          status: "SUCCEEDED",
          resultKey: key,
          error: null,
          completedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        });
      } catch (error) {
        // A refusal by the domain is final: retrying cannot change the answer.
        const refused = error instanceof DomainError;
        if (!refused && !opts.lastAttempt) throw error;
        await finish(ownerId, exportId, {
          status: "FAILED",
          error: {
            code: refused ? error.code : "EXPORT_FAILED",
            message: error instanceof Error ? error.message : "The export failed",
          },
        });
      }
    },
  };
}
