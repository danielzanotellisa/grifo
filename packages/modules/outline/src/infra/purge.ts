import type { PurgeParticipant } from "@app/platform";
import { inArray, lt } from "drizzle-orm";
import { nodes } from "./schema";

/** Deletes the outline nodes whose deletion is past the cutoff (`_cross-cutting/purge`). */
export const outlinePurgeParticipant: PurgeParticipant = {
  name: "outline",

  async purgeExpired(db, cutoff) {
    await db.delete(nodes).where(lt(nodes.deletedAt, cutoff));
  },

  async purgeOwners(db, ownerIds) {
    await db.delete(nodes).where(inArray(nodes.ownerId, ownerIds));
  },
};
