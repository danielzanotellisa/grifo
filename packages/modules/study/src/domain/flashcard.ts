import { DomainError, notFound, type OutlineRole } from "@app/platform";

export type Flashcard = {
  id: string;
  ownerId: string;
  documentId: string;
  sourceNodeId: string | null;
  front: string;
  back: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export const canCreateFlashcard = (nodeEffectiveRole: OutlineRole): boolean =>
  nodeEffectiveRole === "DEFINITION";

export function assertCanCreateFlashcard(nodeEffectiveRole: OutlineRole): void {
  if (!canCreateFlashcard(nodeEffectiveRole)) {
    throw new DomainError(
      "FLASHCARD_REQUIRES_DEFINITION",
      "Only DEFINITION nodes can become flashcards",
      422,
    );
  }
}

/** A soft-deleted card is invisible and read-only (`_cross-cutting/soft-delete`). */
function assertLive(card: Flashcard): void {
  if (card.deletedAt !== null) throw notFound("flashcard");
}

const cleanFront = (front: string): string => {
  const trimmed = front.trim();
  if (trimmed === "") {
    throw new DomainError("FLASHCARD_FRONT_REQUIRED", "The front of the card is required", 422);
  }
  return trimmed;
};

const cleanBack = (back: string): string => {
  const trimmed = back.trim();
  if (trimmed === "") {
    throw new DomainError("FLASHCARD_BACK_EMPTY", "The back of the card is empty", 422);
  }
  return trimmed;
};

export function newFlashcard(input: {
  id: string;
  ownerId: string;
  documentId: string;
  sourceNodeId: string;
  front: string;
  nodeText: string;
  now: Date;
}): Flashcard {
  return {
    id: input.id,
    ownerId: input.ownerId,
    documentId: input.documentId,
    sourceNodeId: input.sourceNodeId,
    front: cleanFront(input.front),
    back: cleanBack(input.nodeText),
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
  };
}

export function editFlashcard(
  card: Flashcard,
  edit: { front: string; back: string },
  now: Date,
): Flashcard {
  assertLive(card);
  return { ...card, front: cleanFront(edit.front), back: cleanBack(edit.back), updatedAt: now };
}

/** Re-copies the node's current text into the back, on the user's request. */
export function updateFromSource(card: Flashcard, nodeText: string, now: Date): Flashcard {
  assertLive(card);
  if (card.sourceNodeId === null) {
    throw new DomainError("FLASHCARD_SOURCE_GONE", "The source node was deleted", 422);
  }
  return { ...card, back: cleanBack(nodeText), updatedAt: now };
}

export function deleteFlashcard(card: Flashcard, now: Date): Flashcard {
  assertLive(card);
  return { ...card, deletedAt: now, updatedAt: now };
}

export function restoreFlashcard(card: Flashcard, now: Date): Flashcard {
  return card.deletedAt === null ? card : { ...card, deletedAt: null, updatedAt: now };
}

/** Stable across exports so Anki updates notes instead of duplicating them (ADR 0027). */
export const ankiGuid = (flashcardId: string): string => `grifo-${flashcardId}`;
