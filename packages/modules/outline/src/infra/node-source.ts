import { highlightSource } from "@app/annotation";
import type { OutlineRole, Tx } from "@app/platform";
import { findNode } from "./repository";

export type NodeSource = { documentId: string; text: string; role: OutlineRole };

/**
 * What the study module needs from a node: its document, its text (its own, or the highlight
 * quote) and its effective role (its own, or the one of its highlight's category). Null when the
 * node is not live, or has neither a role nor a text to resolve.
 */
export async function nodeSource(
  tx: Tx,
  ownerId: string,
  nodeId: string,
): Promise<NodeSource | null> {
  const node = await findNode(tx, ownerId, nodeId);
  if (!node || node.deletedAt) return null;

  const source = node.highlightId ? await highlightSource(tx, ownerId, node.highlightId) : null;
  const role = node.role ?? source?.role ?? null;
  const text = node.text ?? source?.quote ?? null;
  return role === null || text === null ? null : { documentId: node.documentId, text, role };
}
