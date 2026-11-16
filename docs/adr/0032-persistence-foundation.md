# 0032. Persistence foundation: sync cursor, soft-delete marker, database tests

- Status: accepted
- Date: 2026-11-16
- Related: 0006, 0013, 0015, 0016, 0018, 0023

## Context
The backend skeleton has tables and plumbing but nothing wired end to end. Building the first persisted module (outline) exposed four gaps: the pull cursor can skip changes that commit out of order, `processed_mutations` collides across users, a bare `deleted_at` cannot tell a direct delete from a cascade (needed by the trash, see `docs/specs/_cross-cutting/soft-delete`), and there is no way to test code against a real database.

## Decision
1. **Cursor safety.** `recordChange` takes `pg_advisory_xact_lock` keyed by the owner before inserting into `platform.change_log`. Writes of the same owner serialize until commit, so `seq` grows in commit order per owner and a client that stores cursor N never misses a later-committed change. Transactions that write synced data must stay short; the lock is held to commit. Writes of different owners do not contend.
2. **Mutation ids are per owner.** The key of `platform.processed_mutations` becomes `(owner_id, mutation_id)`; a `mutationId` collision across users can no longer reject a push.
3. **Soft-delete marker.** Every owned table gets `deleted_root_id uuid`, set in the same transaction as `deleted_at`: the id of the item the user deleted (the row's own id for a direct delete, the root's id for rows deleted by cascade). `deleted_at is null` if and only if `deleted_root_id is null` (CHECK). Trash items are rows with `deleted_root_id = id`; restore clears every row with that root; a child deleted on its own before its parent keeps its own root and stays deleted when the parent is restored. Closes P-013.
4. **Where invisibility is enforced.** RLS stays owner-only (ADR 0016) because restore, the trash and purge must read deleted rows. Every module read goes through a platform helper that adds `deleted_at is null`; the trash, restore and purge use explicit counterparts. An integration test fails when an owned table lacks RLS or the `deleted_root_id` column.
5. **Database tests.** Vitest gets an `integration` project next to `unit`. Its global setup applies migrations and RLS to a dedicated test database; tests isolate themselves by using fresh owner ids, relying on RLS, so there is no truncation. Locally the compose Postgres is used; CI runs a Postgres 17 service container. No testcontainers.
6. **Schema management.** Generated migrations are committed in `db/migrations`. `pnpm db:setup` runs migrate, queue schema and RLS in that order, and `rls.sql` is idempotent and sets default privileges so new tables are granted without a rerun.

## Considered options
- Cursor by transaction id visibility (`xmin` of the snapshot): no serialization, but subtle to get right and to test. Revisit if same-owner write contention ever shows up.
- A `deletions` table, one row per user action: richer history, one more join on every trash read. Can be added later without changing the marker's meaning.
- testcontainers: stronger isolation, but a new dependency, Docker required in CI and slower suites.
- Filtering deleted rows in RLS: would hide them from restore, trash and purge, which then need a second policy path.

## Consequences
Every owned table and every migration must carry the marker. A forgotten `deleted_at` filter is a bug class that only review and the per-module integration tests catch, since the database does not. The advisory lock makes long transactions that touch synced data a latency risk for that one user.
