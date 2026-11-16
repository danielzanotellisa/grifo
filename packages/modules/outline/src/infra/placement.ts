import { compareHighlightOrder, loadHighlightOrderKeys } from "@app/annotation";
import { outlineNodeIdForHighlight, restoreByRoot, type SyncChange, type Tx } from "@app/platform";
import { generateKeyBetween } from "fractional-indexing";
import { findNode, fixOrphans, insertNode, liveRootNodes } from "./repository";
import { nodes } from "./schema";

const upsert = (entityId: string): SyncChange => ({
  entity: "outlineNode",
  entityId,
  op: "upsert",
});

/** Where a new highlight node goes at the root level: before the first node whose highlight reads later. */
async function positionFor(
  tx: Tx,
  ownerId: string,
  documentId: string,
  highlightId: string,
): Promise<string> {
  const roots = await liveRootNodes(tx, ownerId, documentId);
  const highlightIds = roots.flatMap((n) => (n.highlightId ? [n.highlightId] : []));
  const keys = await loadHighlightOrderKeys(tx, ownerId, [highlightId, ...highlightIds]);
  const mine = keys.get(highlightId);

  const next = mine
    ? roots.find((n) => {
        const key = n.highlightId ? keys.get(n.highlightId) : undefined;
        return key !== undefined && compareHighlightOrder(key, mine) > 0;
      })
    : undefined;
  if (!next) return generateKeyBetween(roots.at(-1)?.position ?? null, null);
  return generateKeyBetween(roots[roots.indexOf(next) - 1]?.position ?? null, next.position);
}

/**
 * Makes sure a highlight that needs a node has one (ADR 0033): creates it with the derived id, or
 * restores it if it left the outline because the highlight was ignored. A node that exists, or that
 * the user deleted directly, is left alone.
 */
export async function placeHighlightNode(
  tx: Tx,
  ownerId: string,
  highlightId: string,
  documentId: string,
  now: Date,
): Promise<SyncChange[]> {
  const id = outlineNodeIdForHighlight(highlightId);
  const existing = await findNode(tx, ownerId, id);

  if (existing) {
    if (!existing.deletedAt || existing.deletedRootId !== highlightId) return [];
    const ids = await restoreByRoot(tx, nodes, { ownerId, rootId: highlightId, now });
    await fixOrphans(tx, ownerId, ids, now);
    return ids.map(upsert);
  }

  const position = await positionFor(tx, ownerId, documentId, highlightId);
  const created = await insertNode(
    tx,
    ownerId,
    { id, documentId, parentId: null, position, highlightId, role: null, text: null },
    now,
  );
  return created ? [upsert(id)] : [];
}
