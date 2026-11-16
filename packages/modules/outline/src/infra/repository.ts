import { liveOnly, softDelete, type SyncChange, type Tx } from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { deleteNode } from "../domain/tree";
import type { OutlineNode } from "../domain/outline-node";
import type { NodeData } from "./payload";
import { nodes } from "./schema";

export type NodeRow = typeof nodes.$inferSelect;

const toDomain = (row: NodeRow): OutlineNode => ({
  id: row.id,
  ownerId: row.ownerId,
  documentId: row.documentId,
  parentId: row.parentId,
  position: row.position,
  highlightId: row.highlightId,
  role: row.role,
  text: row.text,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt,
});

export const toData = (row: NodeRow): NodeData => ({
  id: row.id,
  documentId: row.documentId,
  parentId: row.parentId,
  position: row.position,
  highlightId: row.highlightId,
  role: row.role,
  text: row.text,
});

/** The node by id, deleted or not: callers decide what a deleted node means. */
export async function findNode(tx: Tx, ownerId: string, id: string): Promise<NodeRow | undefined> {
  const [row] = await tx
    .select()
    .from(nodes)
    .where(and(eq(nodes.ownerId, ownerId), eq(nodes.id, id)));
  return row;
}

export async function findLiveNodes(tx: Tx, ownerId: string, ids: string[]): Promise<NodeRow[]> {
  if (ids.length === 0) return [];
  return tx
    .select()
    .from(nodes)
    .where(and(eq(nodes.ownerId, ownerId), inArray(nodes.id, ids), liveOnly(nodes)));
}

async function liveNodesOfDocument(tx: Tx, ownerId: string, documentId: string) {
  const rows = await tx
    .select()
    .from(nodes)
    .where(and(eq(nodes.ownerId, ownerId), eq(nodes.documentId, documentId), liveOnly(nodes)));
  return rows.map(toDomain);
}

/** False when the id already exists, which for another user's node must look like "not found". */
export async function insertNode(
  tx: Tx,
  ownerId: string,
  data: NodeData,
  now: Date,
): Promise<boolean> {
  const inserted = await tx
    .insert(nodes)
    .values({ ...data, ownerId, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning({ id: nodes.id });
  return inserted.length === 1;
}

export async function updateNode(
  tx: Tx,
  ownerId: string,
  data: NodeData,
  now: Date,
): Promise<void> {
  await tx
    .update(nodes)
    .set({
      parentId: data.parentId,
      position: data.position,
      highlightId: data.highlightId,
      role: data.role,
      text: data.text,
      updatedAt: now,
    })
    .where(and(eq(nodes.ownerId, ownerId), eq(nodes.id, data.id), liveOnly(nodes)));
}

/**
 * Soft-deletes a live node under `rootId` and promotes its children into its place, using the
 * domain rule. Returns every change made so the caller can record it.
 */
export async function deleteAndPromote(
  tx: Tx,
  ownerId: string,
  target: NodeRow,
  rootId: string,
  now: Date,
): Promise<SyncChange[]> {
  const before = await liveNodesOfDocument(tx, ownerId, target.documentId);
  const after = deleteNode(before, target.id, now);
  const changes: SyncChange[] = [];

  for (const [i, node] of after.entries()) {
    if (node === before[i]) continue;
    if (node.deletedAt !== null) {
      await softDelete(tx, nodes, { ownerId, id: node.id, rootId, now });
      changes.push({ entity: "outlineNode", entityId: node.id, op: "delete" });
    } else {
      await tx
        .update(nodes)
        .set({ parentId: node.parentId, position: node.position, updatedAt: now })
        .where(and(eq(nodes.ownerId, ownerId), eq(nodes.id, node.id)));
      changes.push({ entity: "outlineNode", entityId: node.id, op: "upsert" });
    }
  }
  return changes;
}
