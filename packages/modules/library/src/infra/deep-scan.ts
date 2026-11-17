import { recordChange, withUser, type Db, type ObjectStorage } from "@app/platform";
import { and, eq, isNull } from "drizzle-orm";
import { findDocument } from "./repository";
import { documents, storedFiles } from "./schema";

export type ScanResult = { clean: true } | { clean: false; signature: string };

/** The malware scanner, injected so the module never depends on the daemon (the worker provides it, ADR 0038). */
export type Scanner = (bytes: Uint8Array) => Promise<ScanResult>;

/** The job that scans the original of a `READY` document (`docs/specs/document/deep-scan.md`). */
export function createDeepScan(deps: {
  db: Db;
  storage: ObjectStorage;
  scan: Scanner;
  log?: (message: string, error: unknown) => void;
}) {
  const { db, storage, scan } = deps;
  const log = deps.log ?? ((message, error) => console.error(message, error));

  return {
    /**
     * A scanner failure throws so the queue retries; after the last attempt the document stays
     * `READY` and the failure is logged (ADR 0038). Malware quarantines every live `READY` document
     * of the owner that uses the same file.
     */
    async run(ownerId: string, documentId: string, opts: { lastAttempt: boolean }): Promise<void> {
      const target = await withUser(db, ownerId, async (tx) => {
        const document = await findDocument(tx, ownerId, documentId);
        if (!document || document.deletedAt || document.status !== "READY") return null;
        const [file] = await tx
          .select({ id: storedFiles.id, storageKey: storedFiles.storageKey })
          .from(storedFiles)
          .where(and(eq(storedFiles.ownerId, ownerId), eq(storedFiles.id, document.storedFileId)));
        return file!;
      });
      if (!target) return;

      let result: ScanResult;
      try {
        result = await scan(await storage.get("originals", target.storageKey));
      } catch (error) {
        if (!opts.lastAttempt) throw error;
        log(
          `document.deepScan: the scan of document ${documentId} failed on its last attempt`,
          error,
        );
        return;
      }
      if (result.clean) return;

      await withUser(db, ownerId, async (tx) => {
        const quarantined = await tx
          .update(documents)
          .set({ status: "QUARANTINED", rejectCode: "MALWARE_DETECTED", updatedAt: new Date() })
          .where(
            and(
              eq(documents.ownerId, ownerId),
              eq(documents.storedFileId, target.id),
              eq(documents.status, "READY"),
              isNull(documents.deletedAt),
            ),
          )
          .returning({ id: documents.id });
        for (const { id } of quarantined) {
          await recordChange(tx, { ownerId, entity: "document", entityId: id, op: "upsert" });
        }
      });
    },
  };
}
