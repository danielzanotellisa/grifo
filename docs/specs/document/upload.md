# Document upload — spec

- Status: draft
- Module: library
- ADRs: 0004, 0005, 0017

## Definition
How a PDF becomes a document: the presigned upload, the checks and the lifecycle `UPLOADED → VALIDATING → READY | REJECTED`, with `READY → QUARANTINED` when the deep scan finds malware. The document itself (rename, move, delete, restore) is in `document`.

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Start upload | Client sends sha256, size, subject; server returns presigned PUT, or reuses the owner's existing `StoredFile` with the same hash. | `UPLOAD_TOO_LARGE` |
| Confirm upload | Server checks object exists, size and hash; runs fast validation; enqueues deep scan. | `UPLOAD_HASH_MISMATCH`, `PDF_INVALID` |
| Open | Returns a short-lived presigned GET for the original. Only `READY` documents can be opened. | `NOT_FOUND`, `DOCUMENT_NOT_READY` |

## Acceptance criteria
- [ ] **AC-1** Given a file that is not a PDF renamed to .pdf, when upload is confirmed, then status is `REJECTED` with `PDF_INVALID`.
- [ ] **AC-2** Given the user re-imports a PDF with the same hash, then no new bytes are uploaded and the new document can reuse the previous highlights (see open question).
- [ ] **AC-3** Given a PDF with `/OpenAction`, then it becomes `READY` and `riskFlags.openAction > 0`.

## Open questions
- Re-import of the same file: create a new document with copied highlights, or reopen the old one? Decide in the spec before implementing.
- Encrypted/password-protected PDFs: accept with password prompt or reject? Undecided.
- Needs the S3 adapter, PDF validation and the worker (ADR 0017, ADR 0026).
