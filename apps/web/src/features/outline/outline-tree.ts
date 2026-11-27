import { generateKeyBetween } from "fractional-indexing";

export type OutlineRole = "TOPIC" | "DEFINITION" | "ITEM";

/** The data of an outline node as the server stores and delivers it (`outline-node` spec). */
export type NodeData = {
  id: string;
  documentId: string;
  parentId: string | null;
  position: string;
  highlightId: string | null;
  role: OutlineRole | null;
  text: string | null;
};

/** Live children of `parentId` (null = root level) in display order. */
export function siblings(nodes: NodeData[], parentId: string | null): NodeData[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

/** Tab: the node becomes the last child of its previous sibling. Null when there is none. */
export function indent(nodes: NodeData[], id: string): NodeData | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const row = siblings(nodes, node.parentId);
  const previous = row[row.findIndex((n) => n.id === id) - 1];
  if (!previous) return null;

  const lastChild = siblings(nodes, previous.id).at(-1);
  return {
    ...node,
    parentId: previous.id,
    position: generateKeyBetween(lastChild?.position ?? null, null),
  };
}

/** Shift+Tab: the node becomes the next sibling of its parent. Null at the root level. */
export function outdent(nodes: NodeData[], id: string): NodeData | null {
  const node = nodes.find((n) => n.id === id);
  const parent = node?.parentId ? nodes.find((n) => n.id === node.parentId) : undefined;
  if (!node || !parent) return null;

  const row = siblings(nodes, parent.parentId);
  const next = row[row.findIndex((n) => n.id === parent.id) + 1];
  return {
    ...node,
    parentId: parent.parentId,
    position: generateKeyBetween(parent.position, next?.position ?? null),
  };
}

/** Alt+Arrow: the node swaps places with its previous (-1) or next (1) sibling. Null at the ends. */
export function moveAmongSiblings(
  nodes: NodeData[],
  id: string,
  direction: -1 | 1,
): NodeData | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const row = siblings(nodes, node.parentId);
  const at = row.findIndex((n) => n.id === id);
  const target = at + direction;
  if (target < 0 || target >= row.length) return null;

  const position =
    direction === -1
      ? generateKeyBetween(row[target - 1]?.position ?? null, row[target]!.position)
      : generateKeyBetween(row[target]!.position, row[target + 1]?.position ?? null);
  return { ...node, position };
}

/** A new node placed right after `afterId` among its siblings, or last at the root when `afterId` is null. */
export function positionAfter(
  nodes: NodeData[],
  afterId: string | null,
): { parentId: string | null; position: string } {
  const after = afterId ? nodes.find((n) => n.id === afterId) : undefined;
  const parentId = after?.parentId ?? null;
  const row = siblings(nodes, parentId);
  if (!after) return { parentId, position: generateKeyBetween(row.at(-1)?.position ?? null, null) };

  const next = row[row.findIndex((n) => n.id === after.id) + 1];
  return { parentId, position: generateKeyBetween(after.position, next?.position ?? null) };
}

export type Row = { node: NodeData; depth: number; topicLevel: number };

/**
 * The tree flattened in display order. `depth` is 1 at the root; `topicLevel` is the number of
 * `TOPIC` ancestors plus 1 (ADR 0009). A node whose parent is missing is shown at the root.
 */
export function flatten(nodes: NodeData[], roleOf: (node: NodeData) => OutlineRole | null): Row[] {
  const ids = new Set(nodes.map((n) => n.id));
  const rootless = (n: NodeData) => n.parentId === null || !ids.has(n.parentId);
  const roots = nodes
    .filter(rootless)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

  const rows: Row[] = [];
  const visit = (node: NodeData, depth: number, topics: number, seen: Set<string>) => {
    if (seen.has(node.id)) return;
    rows.push({ node, depth, topicLevel: topics + 1 });
    const nextTopics = topics + (roleOf(node) === "TOPIC" ? 1 : 0);
    for (const child of siblings(nodes, node.id))
      visit(child, depth + 1, nextTopics, new Set(seen).add(node.id));
  };
  for (const root of roots) visit(root, 1, 0, new Set());
  return rows;
}
