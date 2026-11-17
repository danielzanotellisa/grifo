# 0039. Trash purge: one participant per module, run with the admin connection

- Status: accepted
- Date: 2026-11-18
- Related: 0002, 0005, 0016, 0018, 0029, 0032

## Context
ADR 0018 says items stay restorable for 30 days and then the purge job deletes them, storage versions included. ADR 0032 marks every deleted row with `deleted_at` and `deleted_root_id`. Nothing deletes physically yet, and the rules of the project say that modules own their schema, that there are no foreign keys across schemas, and that RLS leaves deleted rows readable only to the trash, restore and purge. Purging is cross-owner housekeeping, which RLS (owner-only) cannot express.

## Decision
1. **One participant per module.** The platform defines a port, `PurgeParticipant { name, purgeExpired(db, cutoff) }`, next to `TrashParticipant`. Each module that owns soft-deletable tables (library, annotation, outline, study, export) deletes its own rows; the composition root of the worker registers them. The platform never imports a module.
2. **Admin connection.** The job runs on the migrator connection and works across owners in one pass, the exception that `apps/worker/CLAUDE.md` already reserves for the purge. It reads and deletes only rows whose `deleted_at` is older than the cutoff (now minus `TRASH_WINDOW_DAYS`).
3. **Row by row, not by root.** A row is purged when its own `deleted_at` is past the cutoff. A row deleted by cascade carries the timestamp of its root, so it goes with it; a child trashed on its own earlier goes earlier.
4. **Foreign keys inside a schema.** Children first (documents before subjects, highlights before categories). A parent that is still referenced, by a row in any state, is kept and removed by a later run, so a purge never fails on a constraint.
5. **Storage first.** A stored file is purged when no document, live or trashed, references it. In one transaction that holds a lock on its row, the object is deleted from the storage and then the row is deleted. Deleting an object that is already gone is not an error, so a failure after the object delete is repaired by the next run. Because the lock conflicts with the foreign key check of a document being created for the same bytes, that import fails and is retried instead of pointing at a deleted object. Exports follow the same order for their result object.
6. **The change log is not touched.** A client that pulls an entity that no longer exists already receives a tombstone (`_cross-cutting/sync`). Trimming the log is the compaction of `P-007`.
7. **Failures are isolated.** Each participant runs on its own; the job runs all of them and then fails if any failed, so Graphile retries. The purge is idempotent.
8. **Accounts.** Purging a deleted account after 30 days reuses this port with a second method and is a separate slice with its own spec.

## Considered options
- **Per-owner purge through `withUser`.** Needs an RLS policy that exposes deleted rows to the job and an owner loop; no gain, since the job never serves a user.
- **Purge by root.** Needs the root of every cascaded row and ordering across modules; the shared timestamp makes it unnecessary.
- **Delete the row, then the object.** A failure between the two leaves an object nobody references and nothing to find it by.
- **A database-level `ON DELETE CASCADE`.** Does not cross schemas and hides what is being deleted.

## Consequences
The purge is the one code path that deletes data for good, so each module's rule is tested on its own, and the order above is tested with the real foreign keys. Unreferenced stored files left by earlier failures are collected by the same job. The storage call inside a transaction is deliberate (it is one short delete holding one row lock).
