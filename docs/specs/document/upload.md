# Document upload — spec

- Status: approved
- Module: library
- ADRs: 0004, 0005, 0017, 0037

## Definition
How a PDF becomes a document: the presigned upload, the checks and the lifecycle `UPLOADED → VALIDATING → READY | REJECTED`. The deep malware scan (`READY → QUARANTINED`) is `document/deep-scan`. The document itself (rename, move, delete, restore) is in `document`.

## API
- `POST /api/documents/uploads` `{ documentId, subjectId, title, sha256, sizeBytes }` → `201 { documentId, upload: { url, headers } | null }`. `documentId` is the client-generated id; `sha256` is lowercase hex; `title` is the default chosen by the client (PDF title or file name), trimmed 1–200 characters. `upload` is null when the owner already has the bytes.
- `PUT <upload.url>` with `upload.headers` (content type and `x-amz-checksum-sha256`) goes straight to the storage; the storage refuses bytes that do not match the declared hash.
- `POST /api/documents/{id}/confirm` → `202 { status: "VALIDATING" }`.
- `GET /api/documents/{id}/file` → `200 { url, expiresInSeconds }`, a short-lived presigned GET of the original.

## Rules
1. Start creates, in one transaction, the document in `UPLOADED` under the subject, the owner's `StoredFile` for the hash when none exists, and the change-log entry of the document. The bytes are never routed through the app.
2. Start is idempotent per `documentId`: the same call again returns the same document and a fresh presigned URL; the same id with another subject, hash or size answers 409 `UPLOAD_CONFLICT`.
3. An id that belongs to another user answers 404, like a missing one. A subject that is missing or another user's answers 404; a deleted subject answers 422 `PARENT_DELETED`; a size over 100 MiB answers 413 `UPLOAD_TOO_LARGE`; anything malformed answers 400 `VALIDATION_FAILED`.
4. Deduplication is per owner: the same hash by the same owner reuses the `StoredFile` and uploads nothing (`upload: null`); each import is a new document without highlights. Two owners with the same PDF have two objects (ADR 0005).
5. Confirm needs the object to exist with the declared size, else 409 `UPLOAD_INCOMPLETE`. It moves `UPLOADED → VALIDATING` and enqueues `document.validate` with only `ownerId` and `documentId`, in one transaction. Confirming again does nothing more and answers the current status.
6. `document.validate` reads the object and ends the document as `READY` with `pageCount` and `riskFlags`, or `REJECTED` with `rejectCode`: `PDF_INVALID` (no `%PDF` signature or not parseable), `PDF_ENCRYPTED` (a password is needed to open it), `VALIDATION_FAILED` (an unexpected failure on the last attempt). It records the change in the change log. A document that is not `VALIDATING` is left alone, so a repeated job is harmless.
7. `riskFlags` follow ADR 0037 point 4 and are a lower bound.
8. Open answers the presigned URL only for a live `READY` document of the caller; another status answers 409 `DOCUMENT_NOT_READY`; another user's, deleted or missing answers 404.
9. Every route answers 401 without a session; start and confirm check the `Origin` (403).

## Acceptance criteria
- [ ] **AC-1** Given a file that is not a PDF renamed to .pdf, when the validation job runs, then status is `REJECTED` with `rejectCode` `PDF_INVALID`; a truncated PDF gives the same.
- [ ] **AC-2** Given the owner re-imports a PDF with the same hash, then start answers `upload: null`, no new `StoredFile` or object exists, and a new document in `UPLOADED` exists; two owners with the same PDF have two objects.
- [ ] **AC-3** Given a PDF with an uncompressed `/OpenAction`, then it becomes `READY` and `riskFlags.openAction > 0`; a PDF with JavaScript has `riskFlags.javascript > 0`.
- [ ] **AC-4** Given start with a size over 100 MiB, a malformed body, a subject of another user or missing, a deleted subject, or a `documentId` of another user, then 413 `UPLOAD_TOO_LARGE`, 400, 404, 422 `PARENT_DELETED` and 404, and nothing is created.
- [ ] **AC-5** Given start is repeated with the same data, then one document exists and a new URL is returned; given the same id with another hash, then 409 `UPLOAD_CONFLICT`.
- [ ] **AC-6** Given a presigned PUT whose bytes do not match the declared hash, then the storage refuses it and no object exists; given matching bytes, then the object exists with the declared size.
- [ ] **AC-7** Given confirm with no object or another size, then 409 `UPLOAD_INCOMPLETE` and the status stays `UPLOADED`; given the object, then 202, status `VALIDATING` and one job holding only ids; given confirm again, then no second job.
- [ ] **AC-8** Given a password-protected PDF, then `REJECTED` with `PDF_ENCRYPTED`; given a valid PDF, then `READY` with its page count; given a job running twice, then the second changes nothing.
- [ ] **AC-9** Given a `READY` document, then open answers a working presigned URL; given another status, 409 `DOCUMENT_NOT_READY`; given a deleted, foreign or missing document, 404.
- [ ] **AC-10** Given no session, then each route answers 401 and does no work; given a foreign or missing `Origin`, then start and confirm answer 403 `FORBIDDEN_ORIGIN`.
- [ ] **AC-11** Given a document goes through the upload, then a pull delivers it with `UPLOADED`, then `VALIDATING`, then `READY` or `REJECTED` with its `rejectCode`.
- [ ] **AC-12** Given a job that fails unexpectedly on its last attempt, then the document is `REJECTED` with `VALIDATION_FAILED`.

## Open questions
- Copying the highlights of a previous import into a new one is a future, explicit feature.
- The deep scan, `QUARANTINED` and the purge of unreferenced objects: `document/deep-scan` and the purge slice.
