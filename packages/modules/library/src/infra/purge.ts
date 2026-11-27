import type { Db, ObjectStorage, PurgeParticipant } from "@app/platform";
import { and, eq, lt, notExists, sql } from "drizzle-orm";
import { documents, storedFiles, subjects } from "./schema";

const unreferenced = (db: Db) =>
  notExists(
    db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.storedFileId, storedFiles.id)),
  );

/**
 * Deletes documents, then the subjects no document references, whose deletion is past the cutoff,
 * then the stored files nothing references, object first (ADR 0039, `_cross-cutting/purge`).
 */
export function createLibraryPurgeParticipant(deps: { storage: ObjectStorage }): PurgeParticipant {
  return {
    name: "library",

    async purgeExpired(db, cutoff) {
      await db.delete(documents).where(lt(documents.deletedAt, cutoff));
      await db
        .delete(subjects)
        .where(
          and(
            lt(subjects.deletedAt, cutoff),
            notExists(
              db
                .select({ id: documents.id })
                .from(documents)
                .where(eq(documents.subjectId, subjects.id)),
            ),
          ),
        );

      const candidates = await db
        .select({ id: storedFiles.id, storageKey: storedFiles.storageKey })
        .from(storedFiles)
        .where(and(lt(storedFiles.createdAt, cutoff), unreferenced(db)));

      let failure: unknown;
      for (const file of candidates) {
        try {
          // One short delete under a row lock: an import of the same bytes waits for it and then
          // fails its foreign key check instead of pointing at a deleted object.
          await db.transaction(async (tx) => {
            const { rows } = await tx.execute(sql`
              select 1 from library.stored_files f
              where f.id = ${file.id}
                and not exists (select 1 from library.documents d where d.stored_file_id = f.id)
              for update`);
            if (rows.length === 0) return;
            await deps.storage.delete("originals", file.storageKey);
            await tx.delete(storedFiles).where(eq(storedFiles.id, file.id));
          });
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    },
  };
}
