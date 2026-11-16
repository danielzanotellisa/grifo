# Module: library

Subjects, documents and the stored PDF files. Schema: `library`. Specs: `docs/specs/subject/`, `document/`, `stored-file/`.

## Owns
- `Subject`, `Document`, `StoredFile` (tables `subjects`, `documents`, `stored_files`).

## Public API (`src/index.ts`)
- Types, `DocumentStatus`, `canTransition`, `isSha256Hex`. Use cases are added here as they are specified.
- Other modules ask library whether a document exists/is readable; they never query its tables.

## Rules
- A document belongs to exactly one subject; moving it changes `subject_id` only.
- `StoredFile` is immutable and content-addressed by SHA-256 **per owner**; never dedupe across users (ADR 0005).
- Upload: client gets a presigned PUT, uploads directly, then confirms; the server re-checks size and hash before accepting.
- Status machine: `UPLOADED → VALIDATING → READY | REJECTED`; `READY → QUARANTINED` if the deep scan finds malware (ADR 0017). Only `READY` documents can be opened.
- Deleting a subject or document is a soft delete (`softDelete`/`softDeleteWhere`, root = the item the user deleted) and publishes an event carrying `rootId` so annotation/outline/study soft-delete their rows in the same transaction. A deleted row is invisible and read-only (`docs/specs/_cross-cutting/soft-delete`).

## Depends on
- `@app/platform`. Must not import any other module (it is at the bottom of the graph).
