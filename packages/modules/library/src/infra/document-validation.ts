import { enqueueJob, recordChange, withUser, type Db, type ObjectStorage } from "@app/platform";
import { and, eq } from "drizzle-orm";
import type { RiskFlags } from "../domain/document";
import { findDocument } from "./repository";
import { documents, storedFiles } from "./schema";

export type RejectCode = "PDF_INVALID" | "PDF_ENCRYPTED" | "VALIDATION_FAILED";

export type InspectResult =
  | { ok: true; pageCount: number; riskFlags: RiskFlags; hasText: boolean }
  | { ok: false; code: "PDF_INVALID" | "PDF_ENCRYPTED" };

/** The PDF parser, injected so the module never depends on it (the worker provides it, ADR 0037). */
export type PdfInspector = (bytes: Uint8Array) => Promise<InspectResult>;

const SIGNATURE = Buffer.from("%PDF-");
const SIGNATURE_WINDOW = 1024;

const hasSignature = (bytes: Uint8Array): boolean =>
  Buffer.from(bytes.subarray(0, SIGNATURE_WINDOW)).includes(SIGNATURE);

/** The job that ends the validation of an uploaded document (`docs/specs/document/upload.md`). */
export function createDocumentValidation(deps: {
  db: Db;
  storage: ObjectStorage;
  inspect: PdfInspector;
}) {
  const { db, storage, inspect } = deps;

  const finish = (
    ownerId: string,
    documentId: string,
    outcome:
      | { status: "READY"; pageCount: number; riskFlags: RiskFlags; hasText: boolean }
      | { status: "REJECTED"; rejectCode: RejectCode },
  ) =>
    withUser(db, ownerId, async (tx) => {
      const changed = await tx
        .update(documents)
        .set({
          status: outcome.status,
          updatedAt: new Date(),
          ...(outcome.status === "READY"
            ? {
                pageCount: outcome.pageCount,
                riskFlags: outcome.riskFlags,
                hasText: outcome.hasText,
                rejectCode: null,
              }
            : { rejectCode: outcome.rejectCode }),
        })
        .where(
          and(
            eq(documents.ownerId, ownerId),
            eq(documents.id, documentId),
            eq(documents.status, "VALIDATING"),
          ),
        )
        .returning({ id: documents.id });
      if (changed.length > 0) {
        await recordChange(tx, { ownerId, entity: "document", entityId: documentId, op: "upsert" });
        if (outcome.status === "READY") {
          await enqueueJob(
            tx,
            "document.deepScan",
            { ownerId, documentId },
            { jobKey: `document.deepScan:${documentId}` },
          );
        }
      }
    });

  return {
    /**
     * Throws on an unexpected failure so the queue retries; on the last attempt it rejects the
     * document with `VALIDATION_FAILED` instead. A document that is not `VALIDATING` is left alone.
     */
    async run(ownerId: string, documentId: string, opts: { lastAttempt: boolean }): Promise<void> {
      const target = await withUser(db, ownerId, async (tx) => {
        const document = await findDocument(tx, ownerId, documentId);
        if (!document || document.deletedAt || document.status !== "VALIDATING") return null;
        const [file] = await tx
          .select({ storageKey: storedFiles.storageKey })
          .from(storedFiles)
          .where(and(eq(storedFiles.ownerId, ownerId), eq(storedFiles.id, document.storedFileId)));
        return file!.storageKey;
      });
      if (!target) return;

      try {
        const bytes = await storage.get("originals", target);
        const result: InspectResult = hasSignature(bytes)
          ? await inspect(bytes)
          : { ok: false, code: "PDF_INVALID" };
        await finish(
          ownerId,
          documentId,
          result.ok
            ? {
                status: "READY",
                pageCount: result.pageCount,
                riskFlags: result.riskFlags,
                hasText: result.hasText,
              }
            : { status: "REJECTED", rejectCode: result.code },
        );
      } catch (error) {
        if (!opts.lastAttempt) throw error;
        await finish(ownerId, documentId, { status: "REJECTED", rejectCode: "VALIDATION_FAILED" });
      }
    },
  };
}
