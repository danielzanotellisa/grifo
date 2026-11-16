import { liveOnly, softDelete, type SyncChange, type Tx } from "@app/platform";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
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

/** Live nodes at the root level of a document, in display order. */
export async function liveRootNodes(
  tx: Tx,
  ownerId: string,
  documentId: string,
): Promise<NodeRow[]> {
  const rows = await tx
    .select()
    .from(nodes)
    .where(
      and(
        eq(nodes.ownerId, ownerId),
        eq(nodes.documentId, documentId),
        isNull(nodes.parentId),
        liveOnly(nodes),
      ),
    );
  return rows.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

/**
 * A node restored through a document or a highlight may sit under a parent that was deleted on its
 * own meanwhile. A live node never stays under a deleted parent: it goes to the end of the root.
 */
export async function fixOrphans(tx: Tx, ownerId: string, ids: string[], now: Date): Promise<void> {
  for (const id of ids) {
    const row = await findNode(tx, ownerId, id);
    if (!row || row.deletedAt || row.parentId === null) continue;
    const parent = await findNode(tx, ownerId, row.parentId);
    if (parent && !parent.deletedAt) continue;

    const roots = (await liveRootNodes(tx, ownerId, row.documentId)).filter((n) => n.id !== id);
    const position = generateKeyBetween(roots.at(-1)?.position ?? null, null);
    await tx
      .update(nodes)
      .set({ parentId: null, position, updatedAt: now })
      .where(and(eq(nodes.ownerId, ownerId), eq(nodes.id, id)));
  }
}
