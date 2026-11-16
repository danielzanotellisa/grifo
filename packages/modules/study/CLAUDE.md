# Module: study

Flashcards and decks. Schema: `study`. Specs: `docs/specs/flashcard/`, `docs/specs/deck/`.

## Owns
- `Flashcard` (table `flashcards`). `Deck` is a projection, not a table.

## Public API (`src/index.ts`)
- `createFlashcardSyncHandler({ nodeSource })`, `createFlashcardTrashParticipant({ documentIsLive })`, `registerStudyReactions(events)`: registered at the composition root. `nodeSource` is the outline's port (document, text and effective role of a live node).
- Types, `canCreateFlashcard`, `assertCanCreateFlashcard`, `newFlashcard`, `editFlashcard`, `updateFromSource`, `deleteFlashcard`, `restoreFlashcard`, `ankiGuid`, `deckName`, `DeckScope`.

## Rules
- A flashcard can only be created from an outline node whose effective role is `DEFINITION` (`FLASHCARD_REQUIRES_DEFINITION`).
- Front = text the user writes (term/question). Back = the node text **copied** at creation. Later edits to the node never change the card silently; the UI may offer "update card too".
- `document_id` is always set (filtering), taken from the node on creation. `source_node_id` is never cleared when the node is deleted or restored (deleting is reversible); the source counts as gone while the node is not live, and "update from source" then answers `FLASHCARD_SOURCE_GONE`. It is null only after the purge job removes the node.
- A flashcard id never changes after creation: it derives the Anki GUID (`grifo-<id>`) used to update instead of duplicate on re-import. Never change the prefix.
- Deck = all live flashcards of a document, or of every document in a subject. Deck name is `Subject::Document`; `::` inside user names is replaced so it cannot create fake sub-decks.
- Flashcard operations are pure and immutable: each returns a new card (the same one when nothing changes). Persisting and the change log are the caller's job. A soft-deleted card is invisible and read-only: edit, update from source and delete throw `NOT_FOUND`; only restore applies to it (`docs/specs/_cross-cutting/soft-delete`). Callers load live cards, except restore and the trash.
- Sync (`docs/specs/flashcard`): every mutation is an upsert and the shape of `data` (strict, Zod) tells the operation: create `{ id, sourceNodeId, front }` (the server copies the document and the text from the node, so the back is authoritative), edit `{ id, front, back }`, update from source `{ id, refreshFromSource: true }`, delete `{ id }`. The pure domain functions decide; the handler only persists.
- Deleting a document deletes its cards (`registerStudyReactions`); deleting a node or a highlight does not. Restoring a card needs its document live (`PARENT_DELETED`).
- MVP card type is Basic (front/back). Cloze is out of scope until a spec says otherwise.

## Depends on
- `@app/platform`, `@app/outline` (node text + effective role), `@app/library`.
