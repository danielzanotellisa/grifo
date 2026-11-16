# Subject — spec

- Status: approved
- Module: library
- ADRs: 0013, 0015, 0018, 0032

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
| Create / rename | Name required, trimmed. | `SUBJECT_NAME_INVALID`, `SUBJECT_INVALID`, `NOT_FOUND` |
| Delete | Soft delete; its live documents go to the trash with it under the subject's root, in one transaction, and each publishes `library.documentDeleted`, so their highlights, nodes and flashcards follow. | `NOT_FOUND` |
| Restore | Restores the subject and everything deleted with it. | `NOT_FOUND` |
| List | Derived on the client from the synced subjects and documents; there is no server query. | — |

## Sync
Entity `subject`. `data`: `{ id, name }`, and the server returns the same. An upsert creates or renames.

## Acceptance criteria
- [ ] **AC-1** Given a subject with 3 documents, when it is deleted and then restored within 30 days, then the 3 documents are back unchanged, and what hangs off them (highlights, nodes, flashcards) comes back through the same restore.
- [ ] **AC-2** Given a subject with documents is deleted, then each live document is soft-deleted under the subject's root and a `library.documentDeleted` event carrying that root is published for each; a document deleted earlier keeps its own root and publishes nothing.
- [ ] **AC-3** Given an upsert with a name of 1 to 120 characters after trim, then the subject is created or renamed with the trimmed name and a pull returns it; a blank or longer name answers `SUBJECT_NAME_INVALID` and nothing is stored.
- [ ] **AC-4** Given an upsert or delete for a deleted subject or for one of another user, then `NOT_FOUND` and nothing changes.
- [ ] **AC-5** Given a deleted subject, then the trash lists it with its name, and the documents deleted with it are not listed on their own.
