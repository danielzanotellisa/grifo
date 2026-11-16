# Flashcard — spec

- Status: approved
- Module: study
- ADRs: 0013, 0015, 0027, 0032

## Definition
A Basic (front/back) study card created from a `DEFINITION` outline node.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| documentId | uuid | Required (filtering, deck). |
| sourceNodeId | uuid? | The node the card was made from. Kept when the node is deleted or restored; null only after the purge job removes the node. The source counts as gone while the node is not live. |
| front | text | User-written term or question. Non-empty. |
| back | text | Node text copied at creation. Editable afterwards. |

## Invariants
1. Created only from a node whose effective role is `DEFINITION`.
2. Back is a copy; editing the node does not change the card.
3. The id never changes (it derives the Anki GUID).

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Create from node | From the reader (right-click on a DEFINITION highlight) or the outline. User writes the front; the server takes the document and the back from the node. | `FLASHCARD_REQUIRES_DEFINITION`, `FLASHCARD_FRONT_REQUIRED`, `FLASHCARD_BACK_EMPTY`, `FLASHCARD_INVALID`, `PARENT_DELETED` |
| Edit | Front and back, both trimmed and non-empty. | `FLASHCARD_FRONT_REQUIRED`, `FLASHCARD_BACK_EMPTY`, `NOT_FOUND` |
| Update from source | Re-copies the current node text into the back, on request. Fails while the node is not live. | `FLASHCARD_SOURCE_GONE`, `FLASHCARD_BACK_EMPTY`, `NOT_FOUND` |
| Delete / restore | Soft delete. A deleted card is invisible and read-only (`_cross-cutting/soft-delete`): edit, update from source and delete answer `NOT_FOUND`. Restoring a live card changes nothing. A card is restored only while its document is live. Deleting a document deletes its cards; deleting a node or a highlight keeps them. | `NOT_FOUND`, `PARENT_DELETED` |

## Sync
Entity `flashcard`. Every mutation is an upsert and the server tells the operation by the shape of `data` (all strict):
- create: `{ id, sourceNodeId, front }`
- edit: `{ id, front, back }`
- update from source: `{ id, refreshFromSource: true }`
- delete: `{ id }`

A pull delivers `{ id, documentId, sourceNodeId, front, back }`. The effective role of the node (its own, or the one of its highlight's category) and its text (its own, or the highlight quote) are read from the outline through a port.

## Acceptance criteria
- [ ] **AC-1** Given an ITEM node, when creating a flashcard is attempted via API, then 422 `FLASHCARD_REQUIRES_DEFINITION`.
- [ ] **AC-2** Given a flashcard, when its node text is edited, then the flashcard back is unchanged.
- [ ] **AC-4** Given a DEFINITION node with text and a front written by the user, when the flashcard is created, then it is live, linked to the node and its back is the trimmed node text.
- [ ] **AC-5** Given an empty or blank front, or a blank back (blank node text on create or update from source), when a flashcard is created or edited, then 422 `FLASHCARD_FRONT_REQUIRED` or `FLASHCARD_BACK_EMPTY` and nothing changes.
- [ ] **AC-6** Given a flashcard, when its front and back are edited, then it shows the new trimmed text and keeps its id.
- [ ] **AC-7** Given a flashcard whose node text changed, when it is updated from source, then its back is the new trimmed node text and its front is unchanged.
- [ ] **AC-8** Given a flashcard whose node was deleted, when it is updated from source, then 422 `FLASHCARD_SOURCE_GONE`.
- [ ] **AC-9** Given a flashcard, when it is deleted then restored, then it is hidden then live again; restoring a live card changes nothing.
- [ ] **AC-10** Given a deleted flashcard, when it is edited, updated from source or deleted again, then 404 `NOT_FOUND` and the card is unchanged.
- [ ] **AC-11** Given a client creates a flashcard from a `DEFINITION` node, then it is stored with the document of the node, the trimmed node text as back and the trimmed front, and a pull returns it; given a node that is not `DEFINITION` (its own role, or its highlight's category role), then `FLASHCARD_REQUIRES_DEFINITION`; given a node that is deleted or missing, then `PARENT_DELETED`; nothing is stored in these cases.
- [ ] **AC-12** Given `data` that is malformed or mixes formats, or a create for an id that already has a live card, then `FLASHCARD_INVALID`; given an edit, update from source or delete for a missing id, a deleted card or one of another user, or a create for the id of a deleted card or of another user, then `NOT_FOUND`; nothing changes.
- [ ] **AC-13** Given the node of a flashcard is not live (deleted by the user, by its highlight, by IGNORE or by its document), then the card stays live with its `sourceNodeId`, update from source answers `FLASHCARD_SOURCE_GONE`, and it works again once the node is restored.
- [ ] **AC-14** Given a document is deleted, then its flashcards are deleted with the document's root and a pull delivers the tombstones, and restoring the document brings them back.
- [ ] **AC-15** Given a directly deleted flashcard, then the trash lists it with its front and restoring it makes it live again; restoring it while its document is deleted answers `PARENT_DELETED` and restores nothing.

AC-3 (three actions to create a card from the reader, ADR 0014) moved to `flashcard/create-from-reader`; a retired criterion keeps its number.
