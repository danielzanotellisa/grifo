export type { Flashcard } from "./domain/flashcard";
export {
  ankiGuid,
  assertCanCreateFlashcard,
  canCreateFlashcard,
  deleteFlashcard,
  editFlashcard,
  newFlashcard,
  restoreFlashcard,
  updateFromSource,
} from "./domain/flashcard";
export type { DeckScope } from "./domain/deck";
export { deckName } from "./domain/deck";
export { createFlashcardSyncHandler } from "./infra/flashcard-sync";
export type { FlashcardDeps, NodeSourcePort } from "./infra/flashcard-sync";
export { createFlashcardTrashParticipant } from "./infra/flashcard-trash";
export { registerStudyReactions } from "./infra/reactions";
