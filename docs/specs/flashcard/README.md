# Flashcard — spec

- Status: draft
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
| Create from node | From the reader (right-click on a DEFINITION highlight) or the outline. User writes the front. | `FLASHCARD_REQUIRES_DEFINITION`, `FLASHCARD_FRONT_REQUIRED` |
| Edit | Front and back. | — |
| Update from source | Re-copies the current node text into the back, on request. | `FLASHCARD_SOURCE_GONE` |
| Delete / restore | Soft delete. | — |

## Acceptance criteria
- [ ] **AC-1** Given an ITEM node, when creating a flashcard is attempted via API, then 422 `FLASHCARD_REQUIRES_DEFINITION`.
- [ ] **AC-2** Given a flashcard, when its node text is edited, then the flashcard back is unchanged.
- [ ] **AC-3** Creating a card from the reader takes ≤ 3 actions (ADR 0014).
