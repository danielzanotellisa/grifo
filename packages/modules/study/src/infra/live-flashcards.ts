import { liveOnly, type Tx } from "@app/platform";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Flashcard } from "../domain/flashcard";
import { toDomain } from "./flashcard-repository";
import { flashcards } from "./schema";

/** The owner's live flashcards of these documents, oldest first (`export/apkg`). */
export async function liveFlashcards(
  tx: Tx,
  ownerId: string,
  documentIds: string[],
): Promise<Flashcard[]> {
  if (documentIds.length === 0) return [];
  const rows = await tx
    .select()
    .from(flashcards)
    .where(
      and(
        eq(flashcards.ownerId, ownerId),
        inArray(flashcards.documentId, documentIds),
        liveOnly(flashcards),
      ),
    )
    .orderBy(asc(flashcards.createdAt), asc(flashcards.id));
  return rows.map(toDomain);
}
