# 0013. Domain model and ubiquitous language

- Status: accepted
- Date: 2026-11-15
- Related: 0008, 0009

## Context
Each concept needs one name used the same way in specs, API and database. Code is English; UI is pt-BR.

## Decision
Entities: `User`, `Subject` (Matéria), `Document`, `StoredFile`, `Highlight` (Marcação), `Category`, `OutlineRole` (fixed: `TOPIC`, `DEFINITION`, `ITEM`, `IGNORE`), `OutlineNode` (Nó de resumo), `Flashcard`, `Deck` (projection), `Export`, `SummaryTemplate`. Full glossary: `docs/specs/glossary.md`.

Rules:
1. A document belongs to exactly one subject; it can be moved.
2. Each highlight creates an outline node unless its category role is `IGNORE`. The node's role comes from the category; free-text nodes have their own role.
3. Only `DEFINITION` nodes can become flashcards. Front = user-written phrase; back = node text copied at creation.
4. A flashcard keeps `documentId` (required) and `sourceNodeId` (nullable; deleting the node keeps the card).
5. `Deck` is not a table: it is computed per scope (document or subject); exported as `Subject::Document`.
6. Everything has `ownerId` and soft delete.

Behavior keys off `OutlineRole`, never off a user-typed category name. "Subtopic" is not a role: it is a `TOPIC` nested under a `TOPIC`; heading level comes from depth.

## Considered options
- Persisted decks with explicit membership: a card would sit in both its document deck and its subject deck.
- Cards live-linked to node text: editing the summary would silently change studied cards.

## Consequences
MVP card type is Basic; Cloze is deferred. Changing a category's role changes layout of its nodes but never deletes cards.
