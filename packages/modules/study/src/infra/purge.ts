import type { PurgeParticipant } from "@app/platform";
import { inArray, lt } from "drizzle-orm";
import { flashcards } from "./schema";

/** Deletes the flashcards whose deletion is past the cutoff (`_cross-cutting/purge`). */
export const studyPurgeParticipant: PurgeParticipant = {
  name: "study",

  async purgeExpired(db, cutoff) {
    await db.delete(flashcards).where(lt(flashcards.deletedAt, cutoff));
  },

  async purgeOwners(db, ownerIds) {
    await db.delete(flashcards).where(inArray(flashcards.ownerId, ownerIds));
  },
};
