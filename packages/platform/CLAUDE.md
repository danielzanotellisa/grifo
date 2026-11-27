# packages/platform

Shared infrastructure for every module. No business rules here: if it mentions a Highlight, a Subject or a Flashcard behavior, it belongs in a module.

## Owns
- Schema `platform`: `change_log`, `processed_mutations` (sync, ADR 0015).
- `db/`: connection, `withUser` (sets `app.user_id` for RLS), column helpers.
- `sync/`: `recordChange` (takes the per-owner advisory lock, appends to the change log and `pg_notify('sync', ownerId)` in the same transaction) and `createSyncEngine` (`push`/`pull` as functions, no HTTP; `docs/specs/_cross-cutting/sync`).
- `db/soft-delete.ts` and `trash.ts`: `liveOnly`, `softDelete`, `softDeleteWhere`, `restoreByRoot` and `createTrash` (list and restore). Every owned table has `deleted_root_id` and `softDeleteCheck` (`docs/specs/_cross-cutting/soft-delete`, ADR 0032). `fractionalIndex` declares fractional-index columns with the `"C"` collation (ADR 0009).
- `errors.ts`: `DomainError` with stable `code` (statuses 400, 401, 403, 404, 409, 413, 422, 429; resources of another user are always 404), mapped to Problem Details by apps/web.
- `ids.ts`: UUIDv7.
- `purge.ts`: the `PurgeParticipant` port and `createPurge` (cutoff of 30 days, failures isolated per module, ADR 0039). Modules provide the participants; the worker registers them.
- `storage/`: `ObjectStorage` port (S3 API) and its S3 adapter (`createS3Storage(s3ConfigFromEnv(process.env))`; `ensureS3Buckets` for CI and tests). Buckets: originals, derived, backups. A presigned PUT signs `x-amz-checksum-sha256`, so the storage refuses bytes that do not match the declared hash.
- `queue/enqueue.ts`: `enqueueJob(tx, task, payload)` — Graphile Worker `add_job` inside the caller's transaction (ADR 0029). Payload always has `ownerId`.
- `entitlements.ts`: single `EntitlementPolicy`; currently allows everything (ADR 0019).
- `kernel/`: types shared by several modules (`OutlineRole`, `PdfRect`, `TextQuote`) and `outlineNodeIdForHighlight`, the UUIDv5 id of a highlight's node that client and server both compute (ADR 0033; the namespace never changes).

## Rules
- Modules may import from here; this package never imports from modules.
- Kernel types change only with an ADR or a spec update, because several schemas mirror them.
- `withUser` is the only way request/job code opens a transaction. Never expose the raw pool to modules.
- `recordChange` must run in the same transaction as the write it describes; a NOTIFY is a doorbell, the change log is the truth. It holds a per-owner lock until commit (ADR 0032), so transactions that write synced data stay short.
- The sync engine knows no entity. Each module exports a `SyncHandler` (`apply` validates, writes and returns every change it made, cascades included; `read` returns live entities by id) and the app registers it in `composition.ts`. A handler rejects with a `DomainError` and never records changes itself during a push. The exception is an event reaction (a cascade): it runs in the publisher's transaction and records the changes of the rows it touches, since the handler cannot return them.
- Soft delete: every module read adds `liveOnly(table)`; deletes go through `softDelete`/`softDeleteWhere` with a `rootId`, which only touch live rows, so a deleted row is never edited or re-rooted. Each module exports a `TrashParticipant` (`list` with a label, `restore` by root that throws `PARENT_DELETED` before writing) registered in `composition.ts`, like the sync handlers.
- Capabilities in `EntitlementPolicy` are named by what they allow (`export.summaryPdf`), never by plan.

## Events
- `events.ts`: in-process bus; handlers run in the publisher's transaction, so a cascade either fully happens or not at all.
- Handlers are registered at each app's composition root (`apps/*/src/composition.ts`), never inside module code at import time.
- `annotation.highlightPlaced` and `annotation.highlightIgnored` tell the outline that a highlight needs a node or lost it; they carry no root (the highlight id is the root).
- Deletion events carry `rootId` (the item the user deleted); a reaction that soft-deletes rows passes it on.
- Events are for in-process reactions only. Anything the client must learn about goes through `recordChange`.
