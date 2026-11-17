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
- Upload (`createUploads({ db, storage })`, spec `document/upload`, ADR 0037): `start` creates the document in `UPLOADED` (and the owner's `StoredFile` for the hash), answers a presigned PUT whose `x-amz-checksum-sha256` the storage verifies, or `upload: null` when the owner already has the bytes; `confirm` checks the object exists with the declared size, moves to `VALIDATING` and enqueues `document.validate` with ids only; `open` presigns a GET for a `READY` document. The app never touches the bytes.
- Validation (`createDocumentValidation({ db, storage, inspect })`): the job body. The PDF parser is injected (`PdfInspector`, provided by the worker), so this module has no PDF dependency. Unexpected failures throw so the queue retries; the last attempt rejects with `VALIDATION_FAILED`.
- Status machine: `UPLOADED → VALIDATING → READY | REJECTED`; `READY → QUARANTINED` if the deep scan finds malware (ADR 0017). Only `READY` documents can be opened.
- Deleting a subject soft-deletes its live documents under the subject's root; every deleted document (directly or by cascade) publishes `library.documentDeleted` with `rootId`, so annotation/outline/study soft-delete their rows in the same transaction. A document deleted earlier keeps its own root and publishes nothing.
- A document is never created through sync: the upload creates it (`docs/specs/document/upload.md`). The sync handler accepts only `{ id, subjectId, title }` (strict) because `storedFileId`, `status`, `pageCount`, `riskFlags` and `rejectCode` are stated by the server. Zod validates the payloads.
- The subject list with document counts is derived on the client; there is no server query.
- Deep scan (`createDeepScan({ db, storage, scan })`, spec `document/deep-scan`, ADR 0038): `document.validate` enqueues `document.deepScan` when a document ends `READY`; the job quarantines (`MALWARE_DETECTED`) every live `READY` document of the owner that uses the infected `StoredFile`. The scanner is injected (`Scanner`, provided by the worker). After the last failed attempt the document stays `READY` and the failure is logged.
- Not built yet: the purge of `StoredFile` objects. The subject deletion publishes only per-document events. A deleted row is invisible and read-only (`docs/specs/_cross-cutting/soft-delete`).

## Depends on
- `@app/platform`. Must not import any other module (it is at the bottom of the graph).
