import type { PurgeParticipant } from "@app/platform";
import { and, eq, lt, notExists } from "drizzle-orm";
import { categories, highlights } from "./schema";

/**
 * Deletes highlights, then the categories no highlight references, whose deletion is past the
 * cutoff. A category still referenced (by a highlight in any state) waits for a later run
 * (`_cross-cutting/purge`).
 */
export const annotationPurgeParticipant: PurgeParticipant = {
  name: "annotation",

  async purgeExpired(db, cutoff) {
    await db.delete(highlights).where(lt(highlights.deletedAt, cutoff));
    await db
      .delete(categories)
      .where(
        and(
          lt(categories.deletedAt, cutoff),
          notExists(
            db
              .select({ id: highlights.id })
              .from(highlights)
              .where(eq(highlights.categoryId, categories.id)),
          ),
        ),
      );
  },
};
