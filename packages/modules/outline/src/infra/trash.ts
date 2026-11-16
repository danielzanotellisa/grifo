import { restoreByRoot, type TrashParticipant } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { findNode, fixOrphans } from "./repository";
import { nodes } from "./schema";
import { parentDeleted, type OutlineDeps } from "./sync-handler";

export function createOutlineTrashParticipant(deps: OutlineDeps): TrashParticipant {
  return {
    entity: "outlineNode",

    async list(tx, ownerId) {
      const rows = await tx
        .select()
        .from(nodes)
        .where(and(eq(nodes.ownerId, ownerId), eq(nodes.deletedRootId, nodes.id)));
      return rows.map((row) => ({
        entity: "outlineNode" as const,
        id: row.id,
        label: row.text ?? "",
        deletedAt: row.deletedAt!,
      }));
    },

    async restore(tx, ownerId, rootId, now) {
      const [root] = await tx
        .select()
        .from(nodes)
        .where(
          and(eq(nodes.ownerId, ownerId), eq(nodes.id, rootId), eq(nodes.deletedRootId, rootId)),
        );
      if (root) {
        if (!(await deps.documentIsLive(tx, ownerId, root.documentId)))
          throw parentDeleted("document");
        if (root.parentId !== null) {
          const parent = await findNode(tx, ownerId, root.parentId);
          if (!parent || parent.deletedAt) throw parentDeleted("parent node");
        }
      }
      const ids = await restoreByRoot(tx, nodes, { ownerId, rootId, now });
      await fixOrphans(tx, ownerId, ids, now);
      return ids.map((id) => ({
        entity: "outlineNode" as const,
        entityId: id,
        op: "upsert" as const,
      }));
    },
  };
}
