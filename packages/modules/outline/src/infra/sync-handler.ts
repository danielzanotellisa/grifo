import { DomainError, notFound, type SyncHandler, type Tx } from "@app/platform";
import { parseDeleteData, parseNodeData, type NodeData } from "./payload";
import {
  deleteAndPromote,
  findLiveNodes,
  findNode,
  insertNode,
  toData,
  updateNode,
  type NodeRow,
} from "./repository";

/** What the outline needs from the library module; the composition root provides it. */
export type OutlineDeps = {
  documentIsLive(tx: Tx, ownerId: string, documentId: string): Promise<boolean>;
};

export const parentDeleted = (what: string) =>
  new DomainError("PARENT_DELETED", `The ${what} was deleted`, 422);

async function assertNoCycle(
  tx: Tx,
  ownerId: string,
  nodeId: string,
  parent: NodeRow,
): Promise<void> {
  const seen = new Set<string>();
  let cursor: NodeRow | undefined = parent;
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === nodeId) {
      throw new DomainError("OUTLINE_CYCLE", "A node cannot be moved under itself", 422);
    }
    seen.add(cursor.id);
    cursor = cursor.parentId ? await findNode(tx, ownerId, cursor.parentId) : undefined;
  }
}

async function upsert(tx: Tx, ownerId: string, data: unknown, deps: OutlineDeps) {
  const node: NodeData = parseNodeData(data);
  const now = new Date();

  if (!(await deps.documentIsLive(tx, ownerId, node.documentId))) throw parentDeleted("document");
  const existing = await findNode(tx, ownerId, node.id);
  if (existing?.deletedAt) throw notFound("outline node");
  if (existing && existing.documentId !== node.documentId) {
    throw new DomainError("OUTLINE_NODE_INVALID", "A node cannot change document", 422);
  }

  if (node.parentId !== null) {
    const parent = await findNode(tx, ownerId, node.parentId);
    if (!parent || parent.deletedAt) throw parentDeleted("parent node");
    if (parent.documentId !== node.documentId) {
      throw new DomainError("OUTLINE_NODE_INVALID", "The parent belongs to another document", 422);
    }
    await assertNoCycle(tx, ownerId, node.id, parent);
  }

  if (existing) await updateNode(tx, ownerId, node, now);
  else if (!(await insertNode(tx, ownerId, node, now))) throw notFound("outline node");
}

async function remove(tx: Tx, ownerId: string, data: unknown) {
  const { id } = parseDeleteData(data);
  const target = await findNode(tx, ownerId, id);
  if (!target || target.deletedAt) throw notFound("outline node");
  return deleteAndPromote(tx, ownerId, target, id, new Date());
}

export function createOutlineSyncHandler(deps: OutlineDeps): SyncHandler {
  return {
    entity: "outlineNode",
    async apply(tx, ownerId, { op, data }) {
      if (op === "delete") return remove(tx, ownerId, data);
      await upsert(tx, ownerId, data, deps);
      return [{ entity: "outlineNode", entityId: (data as NodeData).id, op: "upsert" }];
    },
    async read(tx, ownerId, ids) {
      const rows = await findLiveNodes(tx, ownerId, ids);
      return new Map(rows.map((row) => [row.id, toData(row)]));
    },
  };
}
