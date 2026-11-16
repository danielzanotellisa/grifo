# Deck — spec

- Status: draft
- Module: study
- ADRs: 0013, 0027

## Definition
The set of live flashcards in a scope: one document, or all documents of a subject. Computed, never stored.

## Rules
1. Document deck = live flashcards with that `documentId`.
2. Subject deck = live flashcards of the subject's live documents.
3. Export: one `.apkg` per scope. Deck name `Subject::Document` per card (a subject export creates one sub-deck per document). `::` inside user names is replaced by `:`.
4. Tags on export: subject, document, `page_<n>` of the source highlight when known.

## Acceptance criteria
- [ ] **AC-1** Given a subject with 2 documents and 5 + 3 cards, then the subject .apkg has 8 notes in 2 sub-decks.
- [ ] **AC-2** Given the same deck is exported again after editing 2 cards, then importing it into Anki updates those 2 notes and creates none.
