# Subject — spec

- Status: draft
- Module: library
- ADRs: 0013, 0018

## Definition
A user's group of documents (e.g. "Redes de Computadores"). Top of the hierarchy.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| id | uuid v7 | Client-generated. |
| ownerId | uuid | |
| name | text | 1–120 chars after trim. Not unique. |
| createdAt / updatedAt / deletedAt | timestamptz | |

## Invariants
1. A subject has 0..N documents; each document is in exactly one subject.

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Create | Name required. | `SUBJECT_NAME_INVALID` |
| Rename | Same rules. | `NOT_FOUND` |
| Delete | Soft delete; its documents (and their highlights, nodes, flashcards) go to the trash with it, in one transaction. | `NOT_FOUND` |
| Restore | Restores the subject and everything deleted with it. | `NOT_FOUND` |
| List | Live subjects with document counts. | — |

## Sync
Entity `subject` in the change log.

## Acceptance criteria
- [ ] **AC-1** Given a subject with 3 documents, when it is deleted and then restored within 30 days, then all 3 documents with their highlights, nodes and flashcards are back unchanged.
