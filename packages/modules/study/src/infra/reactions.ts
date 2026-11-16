import { recordChange, softDeleteWhere, type EventBus } from "@app/platform";
import { eq } from "drizzle-orm";
import { flashcards } from "./schema";

/**
 * A deleted document takes its flashcards. Deleting a node or a highlight does not: the cards are
 * kept and their source is simply not live until the node comes back.
 */
export function registerStudyReactions(events: EventBus): void {
  events.subscribe("library.documentDeleted", async (tx, event) => {
    const ids = await softDeleteWhere(tx, flashcards, {
      ownerId: event.ownerId,
      where: eq(flashcards.documentId, event.documentId),
      rootId: event.rootId,
      now: new Date(),
    });
    for (const entityId of ids) {
      await recordChange(tx, {
        ownerId: event.ownerId,
        entity: "flashcard",
        entityId,
        op: "delete",
      });
    }
  });
}
