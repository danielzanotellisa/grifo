import { recordChange, softDeleteWhere, type EventBus } from "@app/platform";
import { eq } from "drizzle-orm";
import { highlights } from "./schema";

/**
 * Reactions to deletions elsewhere. They run in the publisher's transaction and record their own
 * changes: the client learns about cascaded rows only through the change log.
 */
export function registerAnnotationReactions(events: EventBus): void {
  events.subscribe("library.documentDeleted", async (tx, event) => {
    const ids = await softDeleteWhere(tx, highlights, {
      ownerId: event.ownerId,
      where: eq(highlights.documentId, event.documentId),
      rootId: event.rootId,
      now: new Date(),
    });
    for (const entityId of ids) {
      await recordChange(tx, {
        ownerId: event.ownerId,
        entity: "highlight",
        entityId,
        op: "delete",
      });
    }
  });
}
