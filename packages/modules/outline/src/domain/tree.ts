import { DomainError } from "@app/platform";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { OutlineNode } from "./outline-node";

/** Where a moved node lands: under `parentId`, right after sibling `afterId` (null = first). */
export type Placement = { parentId: string | null; afterId: string | null };

type Patch = Partial<Pick<OutlineNode, "parentId" | "position" | "deletedAt">>;

const notFound = (id: string) =>
  new DomainError("OUTLINE_NODE_NOT_FOUND", `Outline node ${id} not found`, 404);

/** Live children of `parentId` (null = root level) in display order. */
export function siblings(nodes: OutlineNode[], parentId: string | null): OutlineNode[] {
  return nodes
    .filter((n) => n.deletedAt === null && n.parentId === parentId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

function find(nodes: OutlineNode[], id: string): OutlineNode {
  const found = nodes.find((n) => n.id === id && n.deletedAt === null);
  if (!found) throw notFound(id);
  return found;
}

function patch(nodes: OutlineNode[], changes: Map<string, Patch>, now: Date): OutlineNode[] {
  return nodes.map((n) => {
    const change = changes.get(n.id);
    return change ? { ...n, ...change, updatedAt: now } : n;
  });
}

/** Tab: becomes the last child of the previous sibling. Unchanged when there is none. */
export function indentNode(nodes: OutlineNode[], id: string, now: Date): OutlineNode[] {
  const node = find(nodes, id);
  const row = siblings(nodes, node.parentId);
  const previous = row[row.findIndex((n) => n.id === id) - 1];
  if (!previous) return nodes;

  const lastChild = siblings(nodes, previous.id).at(-1);
  const position = generateKeyBetween(lastChild?.position ?? null, null);
  return patch(nodes, new Map([[id, { parentId: previous.id, position }]]), now);
}

/** Shift+Tab: becomes the next sibling of its parent. Unchanged at root level. */
export function outdentNode(nodes: OutlineNode[], id: string, now: Date): OutlineNode[] {
  const node = find(nodes, id);
  if (node.parentId === null) return nodes;

  const parent = find(nodes, node.parentId);
  const row = siblings(nodes, parent.parentId);
  const next = row[row.findIndex((n) => n.id === parent.id) + 1];
  const position = generateKeyBetween(parent.position, next?.position ?? null);
  return patch(nodes, new Map([[id, { parentId: parent.parentId, position }]]), now);
}

/** Soft-deletes the node; its children take its place under its parent, in the same order. */
export function deleteNode(nodes: OutlineNode[], id: string, now: Date): OutlineNode[] {
  const node = find(nodes, id);
  const row = siblings(nodes, node.parentId);
  const at = row.findIndex((n) => n.id === id);
  const children = siblings(nodes, id);

  const changes = new Map<string, Patch>([[id, { deletedAt: now }]]);
  const positions = generateNKeysBetween(
    row[at - 1]?.position ?? null,
    row[at + 1]?.position ?? null,
    children.length,
  );
  children.forEach((child, i) => {
    changes.set(child.id, { parentId: node.parentId, position: positions[i]! });
  });
  return patch(nodes, changes, now);
}

/** Drag: moves the node under a new parent between two neighbors. Rejects cycles. */
export function moveNode(
  nodes: OutlineNode[],
  id: string,
  { parentId, afterId }: Placement,
  now: Date,
): OutlineNode[] {
  find(nodes, id);
  for (let cursor = parentId; cursor !== null; cursor = find(nodes, cursor).parentId) {
    if (cursor === id) {
      throw new DomainError("OUTLINE_CYCLE", "A node cannot be moved under itself", 422);
    }
  }

  const row = siblings(nodes, parentId).filter((n) => n.id !== id);
  const at = afterId === null ? -1 : row.findIndex((n) => n.id === afterId);
  if (afterId !== null && at === -1) throw notFound(afterId);

  const position = generateKeyBetween(row[at]?.position ?? null, row[at + 1]?.position ?? null);
  return patch(nodes, new Map([[id, { parentId, position }]]), now);
}
