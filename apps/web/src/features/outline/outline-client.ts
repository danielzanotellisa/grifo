import { v7 as uuidv7 } from "uuid";
import { pullAll, pushMutations, type Pulled, type Result } from "../../lib/api";
import type { DocumentItem } from "../documents/documents-client";
import type { Flashcard } from "../flashcards/flashcards-client";
import { extractMarking, type Category, type HighlightItem } from "../reader/highlights-client";
import type { NodeData, OutlineRole } from "./outline-tree";

export type OutlineData = {
  document: DocumentItem | null;
  categories: Category[];
  highlights: HighlightItem[];
  nodes: NodeData[];
  flashcards: Flashcard[];
};

/** The document, its categories and highlights and its live outline nodes, from one pull. */
export function extractOutline(pulled: Pulled[], documentId: string): OutlineData {
  const document =
    pulled
      .filter((c) => c.entity === "document" && c.op === "upsert")
      .map((c) => c.data as DocumentItem)
      .find((d) => d.id === documentId) ?? null;
  const { categories, highlights } = extractMarking(pulled, documentId);
  const nodes = pulled
    .filter((c) => c.entity === "outlineNode" && c.op === "upsert")
    .map((c) => c.data as NodeData)
    .filter((n) => n.documentId === documentId);
  const flashcards = pulled
    .filter((c) => c.entity === "flashcard" && c.op === "upsert")
    .map((c) => c.data as Flashcard)
    .filter((c) => c.documentId === documentId);
  return { document, categories, highlights, nodes, flashcards };
}

export async function loadOutline(documentId: string): Promise<Result<OutlineData>> {
  const pulled = await pullAll();
  return pulled.ok ? { ok: true, value: extractOutline(pulled.value, documentId) } : pulled;
}

/** The final state of a node, as the server stores it (`outline-node` spec). */
export const saveNode = (node: NodeData): Promise<Result<null>> =>
  pushMutations([{ entity: "outlineNode", op: "upsert", data: { ...node } }]);

export const removeNode = (id: string): Promise<Result<null>> =>
  pushMutations([{ entity: "outlineNode", op: "delete", data: { id } }]);

/** A new free-text node: its id is made here, a UUIDv7 (ADR 0006). */
export const newFreeText = (
  documentId: string,
  place: { parentId: string | null; position: string },
  role: OutlineRole,
  text: string,
): NodeData => ({ id: uuidv7(), documentId, highlightId: null, role, text, ...place });
