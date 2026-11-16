# Document — spec

- Status: draft
- Module: library
- ADRs: 0004, 0005, 0017

## Definition
A PDF the user imported into a subject. The original file never changes; highlights, outline and flashcards hang off the document.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| id | uuid v7 | Client-generated. |
| subjectId | uuid | Required. |
| storedFileId | uuid | The bytes. |
| title | text | Defaults to the PDF title metadata, else the file name. Editable. |
| status | enum | See lifecycle. |
| pageCount | int? | Set by validation. |
| riskFlags | json | Counts of active-content keys (informational). |

## Invariants
1. Belongs to exactly one subject; moving changes only `subjectId`.
2. Only `READY` documents can be opened in the reader.
3. Highlights, nodes and flashcards can be filtered by document.

## Lifecycle
`UPLOADED → VALIDATING → READY | REJECTED`; `READY → QUARANTINED` (deep scan found malware).

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Start upload | Client sends sha256, size, subject; server returns presigned PUT, or reuses the owner's existing `StoredFile` with the same hash. | `UPLOAD_TOO_LARGE` |
| Confirm upload | Server checks object exists, size and hash; runs fast validation; enqueues deep scan. | `UPLOAD_HASH_MISMATCH`, `PDF_INVALID` |
| Open | Returns a short-lived presigned GET for the original. | `NOT_FOUND`, `DOCUMENT_NOT_READY` |
| Rename / move | | `NOT_FOUND` |
| Delete / restore | Cascades to highlights, nodes, flashcards (same transaction). | `NOT_FOUND` |

## Acceptance criteria
- [ ] Given a file that is not a PDF renamed to .pdf, when upload is confirmed, then status is `REJECTED` with `PDF_INVALID`.
- [ ] Given the user re-imports a PDF with the same hash, then no new bytes are uploaded and the new document can reuse the previous highlights (see open question).
- [ ] Given a PDF with `/OpenAction`, then it becomes `READY` and `riskFlags.openAction > 0`.

## Open questions
- Re-import of the same file: create a new document with copied highlights, or reopen the old one? Decide in the spec before implementing.
- Encrypted/password-protected PDFs: accept with password prompt or reject? Undecided.
