# Flashcard — spec

- Status: approved
- Module: study
- ADRs: 0013, 0027

## Definition
A Basic (front/back) study card created from a `DEFINITION` outline node.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| documentId | uuid | Required (filtering, deck). |
| sourceNodeId | uuid? | Null after the node is deleted. |
| front | text | User-written term or question. Non-empty. |
| back | text | Node text copied at creation. Editable afterwards. |

## Invariants
1. Created only from a node whose effective role is `DEFINITION`.
2. Back is a copy; editing the node does not change the card.
3. The id never changes (it derives the Anki GUID).

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Create from node | From the reader (right-click on a DEFINITION highlight) or the outline. User writes the front. | `FLASHCARD_REQUIRES_DEFINITION`, `FLASHCARD_FRONT_REQUIRED`, `FLASHCARD_BACK_EMPTY` |
| Edit | Front and back, both trimmed and non-empty. | `FLASHCARD_FRONT_REQUIRED`, `FLASHCARD_BACK_EMPTY`, `NOT_FOUND` |
| Update from source | Re-copies the current node text into the back, on request. Fails once the node was deleted. | `FLASHCARD_SOURCE_GONE`, `FLASHCARD_BACK_EMPTY`, `NOT_FOUND` |
| Delete / restore | Soft delete. A deleted card is invisible and read-only (`_cross-cutting/soft-delete`): edit, update from source and delete answer `NOT_FOUND`. Restoring a live card changes nothing. | `NOT_FOUND` |

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

AC-3 (three actions to create a card from the reader, ADR 0014) moved to `flashcard/create-from-reader`; a retired criterion keeps its number.
