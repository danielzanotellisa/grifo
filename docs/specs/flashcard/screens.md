# Flashcard screens — spec

- Status: approved
- Module: apps/web
- ADRs: 0013, 0015, 0041
- Related: `flashcard`, `outline-node`, `outline-node/screens`

## Definition
Creating flashcards from the definitions of the summary, and listing, editing, refreshing and removing the cards of a document. Like the other screens it talks straight to the API: no local database and no offline queue. Studying the cards happens in Anki after the export, which is the next slice (`deck`); there is no study mode here.

## Screens
| Path | What it is |
| --- | --- |
| `/documents/{id}/summary` | A node whose effective role is `DEFINITION` gets a "Create flashcard" action; a node that already has cards shows how many and links to them. |
| `/documents/{id}/flashcards` | The cards of a `READY` document: front and back, edit, update from the summary, delete (to the trash). Without a session it redirects to `/login`; a document that is missing or not `READY` shows a message with a link back. |

## Rules
1. The summary pulls the flashcards with everything else. A node offers "Create flashcard" if and only if its effective role is `DEFINITION` (its own role, or the role of the category of its highlight); the key `C` does the same for the selected node. The action opens a field for the front, which is required (trimmed); submitting sends one `upsert` of `{ id, sourceNodeId, front }` with a new UUIDv7, and the server copies the back from the node.
2. A node with cards shows "N flashcards" as a link to the cards page.
3. The cards page lists the live cards of the document sorted by front in pt-BR order, each with its front and its back. Editing a card shows both fields, each trimmed and not empty, and sends one `upsert` of `{ id, front, back }`; Escape cancels without sending. "Update from the summary" sends one `upsert` of `{ id, refreshFromSource: true }`. Delete sends one `delete` of `{ id }` and says the card went to the trash.
4. Nothing is shown as changed before the server answers `applied`; after any change the page is pulled again.
5. A failure is shown by its stable code: `FLASHCARD_REQUIRES_DEFINITION`, `FLASHCARD_FRONT_REQUIRED`, `FLASHCARD_BACK_EMPTY`, `FLASHCARD_INVALID`, `FLASHCARD_SOURCE_GONE` (the node of the card is deleted: the summary must bring it back first), `PARENT_DELETED`, `NOT_FOUND`, `RATE_LIMITED`, a network failure, anything else generic; `UNAUTHENTICATED` goes to `/login`. A failure leaves the cards as the server has them.
6. The summary has a "Flashcards" link to the cards page; each `READY` document row of the subject page has one too.
7. Every text is a key of `messages/pt-BR.json`.

## Acceptance criteria
- [ ] **AC-1** Given nodes of every role, a node whose own role is `DEFINITION`, one with no role of its own whose category is `DEFINITION`, and one whose own role overrides a `DEFINITION` category, then only the nodes whose effective role is `DEFINITION` offer "Create flashcard", and the key `C` opens the field for a selected one and does nothing for another.
- [ ] **AC-2** Given a `DEFINITION` node, when a front is written and sent, then one `upsert` of `{ id, sourceNodeId, front }` goes out with a new UUIDv7 and the trimmed front, the field closes and the node shows one flashcard; a blank front shows the error and sends nothing; Escape closes the field without sending.
- [ ] **AC-3** Given a pull with cards of several documents, then the cards page lists only the live cards of this document, sorted by front, with front and back; given none, an empty message; given a document that is missing, a not-found message; given one that is not `READY`, the message of its state.
- [ ] **AC-4** Given a card, when it is edited, then one `upsert` of `{ id, front, back }` with both trimmed goes out and the page shows them; a blank front or back shows the error and sends nothing; Escape cancels.
- [ ] **AC-5** Given a card, when it is updated from the summary, then one `upsert` of `{ id, refreshFromSource: true }` goes out and the page shows the new back; given the server answers `FLASHCARD_SOURCE_GONE`, then its message is shown.
- [ ] **AC-6** Given a card, when it is deleted, then one `delete` of its id goes out, it leaves the list and the page says it went to the trash.
- [ ] **AC-7** Given a rejected result, a problem answer or a network failure when creating, editing, updating or deleting, then the message of its code is shown and the cards are as the server has them; `UNAUTHENTICATED` goes to `/login`.
- [ ] **AC-8** Given the summary and the subject page, then the summary has a "Flashcards" link to `/documents/{id}/flashcards` and a node with cards links to the same page, and each `READY` document row of the subject page has a "Flashcards" link and no other row has.
- [ ] **AC-9** Given the real app in a browser, when a passage is marked with the Definição category, then its node on the summary offers "Create flashcard"; a card is created with a front, shown on the cards page with the passage as its back, edited, updated from the summary after the node text changes, and deleted.

## Open questions
- The export of the deck to Anki (`deck`, ADR 0027) is the next slice.
- Cards are made only from the summary; the reader's right-click (`flashcard/create-from-reader`) is a later refinement.
