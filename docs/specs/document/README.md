# Document — spec

- Status: approved
- Module: library
- ADRs: 0004, 0005, 0015, 0017, 0032, 0037

## Definition
A PDF the user imported into a subject. The original file never changes; highlights, outline and flashcards hang off the document.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| id | uuid v7 | Client-generated. |
| subjectId | uuid | Required. |
| storedFileId | uuid | The bytes. |
| title | text | Defaults to the PDF title metadata, else the file name. Editable; 1–200 chars after trim. |
| status | enum | See lifecycle. |
| pageCount | int? | Set by validation. |
| riskFlags | json | Counts of active-content keys, a lower bound (informational, ADR 0037). |
| rejectCode | text? | Why the document is `REJECTED` (`PDF_INVALID`, `PDF_ENCRYPTED`, `VALIDATION_FAILED`); null otherwise. |

## Invariants
1. Belongs to exactly one subject; moving changes only `subjectId`.
2. Only `READY` documents can be opened in the reader.
3. Highlights, nodes and flashcards can be filtered by document.

## Lifecycle
`UPLOADED → VALIDATING → READY | REJECTED`; `READY → QUARANTINED` (deep scan found malware).

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Rename / move | Only `title` and `subjectId` change. The target subject must be live. | `DOCUMENT_TITLE_INVALID`, `PARENT_DELETED`, `NOT_FOUND` |
| Delete | Soft delete under its own root; publishes `library.documentDeleted`, so highlights, nodes and flashcards follow in the same transaction. | `NOT_FOUND` |
| Restore | Only a trash item; rejected while its subject is deleted. | `PARENT_DELETED`, `NOT_FOUND` |
| Start upload, Confirm upload, Open | See `document/upload`. | |

## Sync
Entity `document`. A document is not created through sync: it is created by the upload (`document/upload`) and reaches the client by pull. `data` of an upsert: `{ id, subjectId, title }` and nothing else, because `storedFileId`, `status`, `pageCount`, `riskFlags` and `rejectCode` are stated by the server. A pull delivers the full document.

## Acceptance criteria
- [ ] **AC-4** Given an upsert with a title of 1 to 200 characters after trim, then the document is renamed with the trimmed title; a blank or longer title answers `DOCUMENT_TITLE_INVALID` and nothing changes.
- [ ] **AC-5** Given an upsert with another `subjectId`, then only the subject changes and the other fields are untouched; if the target subject is deleted or missing, then `PARENT_DELETED` and nothing changes.
- [ ] **AC-6** Given an upsert for an id that does not exist, a deleted document or one of another user, then `NOT_FOUND`; given `data` with fields other than `id`, `subjectId` and `title`, then `DOCUMENT_INVALID`; in every case nothing changes.
- [ ] **AC-7** Given a document is deleted, then it is soft-deleted under its own root and `library.documentDeleted` is published with that root; deleting it again answers `NOT_FOUND`.
- [ ] **AC-8** Given a deleted document, then the trash lists it with its title, restoring it makes it live again, and restoring it while its subject is deleted answers `PARENT_DELETED` and restores nothing.
- [ ] **AC-9** Given a document id, then the liveness check used by other modules is true only for a live document of that owner.

AC-1 to AC-3 (upload) moved to `document/upload`; a retired criterion keeps its number.
