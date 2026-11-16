# Module: study

Flashcards and decks. Schema: `study`. Specs: `docs/specs/flashcard/`, `docs/specs/deck/`.

## Owns
- `Flashcard` (table `flashcards`). `Deck` is a projection, not a table.

## Public API (`src/index.ts`)
- Types, `canCreateFlashcard`, `assertCanCreateFlashcard`, `newFlashcard`, `editFlashcard`, `updateFromSource`, `deleteFlashcard`, `restoreFlashcard`, `ankiGuid`, `deckName`, `DeckScope`.

## Rules
- A flashcard can only be created from an outline node whose effective role is `DEFINITION` (`FLASHCARD_REQUIRES_DEFINITION`).
- Front = text the user writes (term/question). Back = the node text **copied** at creation. Later edits to the node never change the card silently; the UI may offer "update card too".
- `document_id` is always set (filtering). `source_node_id` is nullable: deleting the node keeps the card.
- A flashcard id never changes after creation: it derives the Anki GUID (`grifo-<id>`) used to update instead of duplicate on re-import. Never change the prefix.
- Deck = all live flashcards of a document, or of every document in a subject. Deck name is `Subject::Document`; `::` inside user names is replaced so it cannot create fake sub-decks.
- Flashcard operations are pure and immutable: each returns a new card (the same one when nothing changes). Persisting and the change log are the caller's job. A soft-deleted card is invisible and read-only: edit, update from source and delete throw `NOT_FOUND`; only restore applies to it (`docs/specs/_cross-cutting/soft-delete`). Callers load live cards, except restore and the trash.
- MVP card type is Basic (front/back). Cloze is out of scope until a spec says otherwise.

## Depends on
- `@app/platform`, `@app/outline` (node text + effective role), `@app/library`.
