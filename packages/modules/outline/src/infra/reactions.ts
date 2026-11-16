import { recordChange, softDeleteWhere, type EventBus } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { deleteAndPromote, findNode } from "./repository";
import { nodes } from "./schema";

/**
 * Reactions to deletions elsewhere. They run in the publisher's transaction and record their own
 * changes: the client learns about cascaded rows only through the change log.
 */
export function registerOutlineReactions(events: EventBus): void {
  events.subscribe("library.documentDeleted", async (tx, event) => {
    const ids = await softDeleteWhere(tx, nodes, {
      ownerId: event.ownerId,
      where: eq(nodes.documentId, event.documentId),
      rootId: event.rootId,
      now: new Date(),
    });
    for (const entityId of ids) {
      await recordChange(tx, {
        ownerId: event.ownerId,
        entity: "outlineNode",
        entityId,
        op: "delete",
      });
    }
  });

  events.subscribe("annotation.highlightDeleted", async (tx, event) => {
    const [node] = await tx
      .select()
      .from(nodes)
      .where(and(eq(nodes.ownerId, event.ownerId), eq(nodes.highlightId, event.highlightId)));
    const live = node && (await findNode(tx, event.ownerId, node.id));
    if (!live || live.deletedAt) return;

    const changes = await deleteAndPromote(tx, event.ownerId, live, event.rootId, new Date());
    for (const change of changes) await recordChange(tx, { ownerId: event.ownerId, ...change });
  });
}
