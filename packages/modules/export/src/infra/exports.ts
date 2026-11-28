import { deckDocuments, type DeckDocument } from "@app/library";
import { nodePages } from "@app/outline";
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

const resultKeyFor = (ownerId: string, exportId: string): string =>
  `${ownerId}/exports/${exportId}.apkg`;

const tag = (text: string): string => text.trim().replaceAll(/\s+/g, "_");

/** Flashcard decks as exports: request, status and the job that builds the package (`export/apkg`). */
export function createExports(deps: { db: Db; storage: ObjectStorage }) {
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

  const finish = (ownerId: string, exportId: string, set: Partial<typeof exports.$inferInsert>) =>
    withUser(db, ownerId, (tx) =>
      tx
        .update(exports)
        .set({ ...set, updatedAt: new Date() })
        .where(and(eq(exports.ownerId, ownerId), eq(exports.id, exportId))),
    );

  return {
    async request(ownerId: string, input: ExportRequest): Promise<{ id: string }> {
      if (input.kind !== "FLASHCARDS_APKG") throw invalid("Only FLASHCARDS_APKG can be exported");
      if (input.scope !== "DOCUMENT" && input.scope !== "SUBJECT") {
        throw invalid("A deck is exported for a DOCUMENT or a SUBJECT");
      }
      const id = newId();
      await withUser(db, ownerId, async (tx) => {
        await documentsOf(tx, ownerId, input.scope, input.scopeId);
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
          downloadName: `${name.replaceAll(/[^\p{L}\p{N} _-]/gu, "")}.apkg`,
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
        const work = await withUser(db, ownerId, async (tx) => {
          const [row] = await tx
            .select()
            .from(exports)
            .where(and(eq(exports.ownerId, ownerId), eq(exports.id, exportId)));
          if (!row || row.deletedAt || row.status === "SUCCEEDED" || !row.scopeId) return null;
          await tx
            .update(exports)
            .set({ status: "RUNNING", updatedAt: new Date() })
            .where(eq(exports.id, exportId));
          return collectNotes(tx, ownerId, row.scope, row.scopeId);
        });
        if (work === null) return;

        const key = resultKeyFor(ownerId, exportId);
        await storage.put("derived", key, await generateApkg(work), "application/octet-stream");
        const now = new Date();
        await finish(ownerId, exportId, {
          status: "SUCCEEDED",
          resultKey: key,
          error: null,
          completedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        });
      } catch (error) {
        if (!opts.lastAttempt) throw error;
        await finish(ownerId, exportId, {
          status: "FAILED",
          error: {
            code: "EXPORT_FAILED",
            message: error instanceof Error ? error.message : "The export failed",
          },
        });
      }
    },
  };
}
