import type { ObjectStorage, PurgeParticipant } from "@app/platform";
import { eq, inArray, lt } from "drizzle-orm";
import { exports } from "./schema";

/**
 * Deletes the exports whose deletion is past the cutoff, each after its result object
 * (`_cross-cutting/purge`). A failure on one export does not stop the others.
 */
export function createExportPurgeParticipant(deps: { storage: ObjectStorage }): PurgeParticipant {
  return {
    name: "export",

    async purgeExpired(db, cutoff) {
      const expired = await db
        .select({ id: exports.id, resultKey: exports.resultKey })
        .from(exports)
        .where(lt(exports.deletedAt, cutoff));

      let failure: unknown;
      for (const row of expired) {
        try {
          if (row.resultKey) await deps.storage.delete("derived", row.resultKey);
          await db.delete(exports).where(eq(exports.id, row.id));
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    },

    async purgeOwners(db, ownerIds) {
      const rows = await db
        .select({ id: exports.id, resultKey: exports.resultKey })
        .from(exports)
        .where(inArray(exports.ownerId, ownerIds));

      let failure: unknown;
      for (const row of rows) {
        try {
          if (row.resultKey) await deps.storage.delete("derived", row.resultKey);
          await db.delete(exports).where(eq(exports.id, row.id));
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    },
  };
}
