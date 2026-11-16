import type { Tx } from "@app/platform";
import { and, eq } from "drizzle-orm";
import type { Flashcard } from "../domain/flashcard";
import { flashcards } from "./schema";

export type FlashcardRow = typeof flashcards.$inferSelect;

/** By id, deleted or not: callers decide what a deleted row means. */
export async function findFlashcard(
  tx: Tx,
  ownerId: string,
  id: string,
): Promise<FlashcardRow | undefined> {
  const [row] = await tx
    .select()
    .from(flashcards)
    .where(and(eq(flashcards.ownerId, ownerId), eq(flashcards.id, id)));
  return row;
}

export const toDomain = (row: FlashcardRow): Flashcard => ({
  id: row.id,
  ownerId: row.ownerId,
  documentId: row.documentId,
  sourceNodeId: row.sourceNodeId,
  front: row.front,
  back: row.back,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt,
});
