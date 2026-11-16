import { DomainError, type OutlineRole } from "@app/platform";

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

export function assertCanCreateFlashcard(nodeEffectiveRole: OutlineRole): void {
  if (nodeEffectiveRole !== "DEFINITION") {
    throw new DomainError("FLASHCARD_REQUIRES_DEFINITION", "Only DEFINITION nodes can become flashcards", 422);
  }
}

export function newFlashcard(input: {
  id: string;
  ownerId: string;
  documentId: string;
  sourceNodeId: string;
  front: string;
  nodeText: string;
  now: Date;
}): Flashcard {
  const front = input.front.trim();
  const back = input.nodeText.trim();
  if (front === "") throw new DomainError("FLASHCARD_FRONT_REQUIRED", "The front of the card is required", 422);
  if (back === "") throw new DomainError("FLASHCARD_BACK_EMPTY", "The source node has no text", 422);
  return {
    id: input.id,
    ownerId: input.ownerId,
    documentId: input.documentId,
    sourceNodeId: input.sourceNodeId,
    front,
    back,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
  };
}

/** Stable across exports so Anki updates notes instead of duplicating them (ADR 0027). */
export const ankiGuid = (flashcardId: string): string => `grifo-${flashcardId}`;
