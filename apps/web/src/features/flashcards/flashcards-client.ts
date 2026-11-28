import { v7 as uuidv7 } from "uuid";
import { pullAll, pushMutations, type Pulled, type Result } from "../../lib/api";
import type { DocumentItem } from "../documents/documents-client";

export type Flashcard = {
  id: string;
  documentId: string;
  sourceNodeId: string | null;
  front: string;
  back: string;
};

export type FlashcardsData = {
  document: DocumentItem | null;
  subjectName: string | null;
  cards: Flashcard[];
  /** The 1-based page of the highlight behind each card, by card id; absent for free text. */
  pages: Record<string, number>;
};

/** The document and its live flashcards, by front in pt-BR (`flashcard/screens`). */
export function extractFlashcards(pulled: Pulled[], documentId: string): FlashcardsData {
  const document =
    pulled
      .filter((c) => c.entity === "document" && c.op === "upsert")
      .map((c) => c.data as DocumentItem)
      .find((d) => d.id === documentId) ?? null;
  const cards = pulled
    .filter((c) => c.entity === "flashcard" && c.op === "upsert")
    .map((c) => c.data as Flashcard)
    .filter((c) => c.documentId === documentId)
    .sort((a, b) => a.front.localeCompare(b.front, "pt-BR"));
  const live = <T>(entity: string) =>
    pulled.filter((c) => c.entity === entity && c.op === "upsert").map((c) => c.data as T);
  const subjectName =
    live<{ id: string; name: string }>("subject").find((s) => s.id === document?.subjectId)?.name ??
    null;
  const nodes = new Map(
    live<{ id: string; highlightId: string | null }>("outlineNode").map((n) => [n.id, n]),
  );
  const highlights = new Map(
    live<{ id: string; pageIndex: number }>("highlight").map((h) => [h.id, h]),
  );
  const pages: Record<string, number> = {};
  for (const card of cards) {
    const node = card.sourceNodeId ? nodes.get(card.sourceNodeId) : undefined;
    const highlight = node?.highlightId ? highlights.get(node.highlightId) : undefined;
    if (highlight) pages[card.id] = highlight.pageIndex + 1;
  }
  return { document, subjectName, cards, pages };
}

export async function loadFlashcards(documentId: string): Promise<Result<FlashcardsData>> {
  const pulled = await pullAll();
  return pulled.ok ? { ok: true, value: extractFlashcards(pulled.value, documentId) } : pulled;
}

/** The server copies the back from the source node; the id is made here, a UUIDv7 (ADR 0006). */
export const createFlashcard = (sourceNodeId: string, front: string): Promise<Result<null>> =>
  pushMutations([
    { entity: "flashcard", op: "upsert", data: { id: uuidv7(), sourceNodeId, front } },
  ]);

export const editFlashcard = (id: string, front: string, back: string): Promise<Result<null>> =>
  pushMutations([{ entity: "flashcard", op: "upsert", data: { id, front, back } }]);

export const refreshFlashcard = (id: string): Promise<Result<null>> =>
  pushMutations([{ entity: "flashcard", op: "upsert", data: { id, refreshFromSource: true } }]);

export const removeFlashcard = (id: string): Promise<Result<null>> =>
  pushMutations([{ entity: "flashcard", op: "delete", data: { id } }]);
