# Module: library

Subjects, documents and the stored PDF files. Schema: `library`. Specs: `docs/specs/subject/`, `document/`, `stored-file/`.

## Owns
- `Subject`, `Document`, `StoredFile` (tables `subjects`, `documents`, `stored_files`).

## Public API (`src/index.ts`)
- Types, `DocumentStatus`, `canTransition`, `isSha256Hex`.
- `createSubjectSyncHandler({ events })`, `createDocumentSyncHandler({ events })`, `subjectTrashParticipant`, `documentTrashParticipant`: registered at the composition root.
- `documentIsLive(tx, ownerId, documentId)` and `documentState(tx, ownerId, documentId)` (status and page count): the questions other modules ask (the outline's and annotation's ports); they never query library's tables.

## Rules
- A document belongs to exactly one subject; moving it changes `subject_id` only.
- `StoredFile` is immutable and content-addressed by SHA-256 **per owner**; never dedupe across users (ADR 0005).
- Upload: client gets a presigned PUT, uploads directly, then confirms; the server re-checks size and hash before accepting.
- Status machine: `UPLOADED → VALIDATING → READY | REJECTED`; `READY → QUARANTINED` if the deep scan finds malware (ADR 0017). Only `READY` documents can be opened.
- Deleting a subject soft-deletes its live documents under the subject's root; every deleted document (directly or by cascade) publishes `library.documentDeleted` with `rootId`, so annotation/outline/study soft-delete their rows in the same transaction. A document deleted earlier keeps its own root and publishes nothing.
- A document is never created through sync: the upload creates it (`docs/specs/document/upload.md`, not built yet). The sync handler accepts only `{ id, subjectId, title }` (strict) because `storedFileId`, `status`, `pageCount` and `riskFlags` are stated by the server. Zod validates the payloads.
- The subject list with document counts is derived on the client; there is no server query.
- Not built yet: the upload, `StoredFile` handling, the `QUARANTINED` transition and the `library.subjectDeleted` event (nothing consumes it). A deleted row is invisible and read-only (`docs/specs/_cross-cutting/soft-delete`).

## Depends on
- `@app/platform`. Must not import any other module (it is at the bottom of the graph).
