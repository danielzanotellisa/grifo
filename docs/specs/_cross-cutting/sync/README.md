# Sync — spec

- Status: approved
- Modules: platform + every module with synced entities
- ADRs: 0006, 0014, 0015, 0016, 0032, 0036

## Definition
The server side of sync: how client mutations are applied exactly once and in order, and how any device catches up from a cursor. The client flow and SSE are in `sync/events`; the compaction horizon is in `sync/compaction`.

## API
- `POST /api/sync/push` `{ mutations: [{ mutationId, entity, op, data }] }` → `{ results: [{ mutationId, status: "applied" | "duplicate" | "rejected", code? }], cursor }`
- `GET /api/sync/pull?since=<cursor>` → `{ changes: [{ entity, entityId, op, data? }], cursor, more }`; `data` is present only for `upsert`.

`data.id` is the client-generated entity id for both operations; the rest of `data` is validated by the handler of the entity.

## Rules
1. A `mutationId` is applied at most once per owner. Resending an applied mutation answers `duplicate`; resending a rejected one answers `rejected` with the same `code`.
2. Server order = arrival order; the batch order is preserved; last arrival wins per entity; delete wins over a concurrent edit.
3. Each mutation runs in its own transaction, together with its record in `processed_mutations`. A rejected mutation does not stop the rest of the batch and leaves nothing behind.
4. The module that owns an entity applies its mutations through a handler registered at the composition root. The handler rejects with a `DomainError`; the result carries its `code` (for example `PARENT_DELETED`, after which the client removes the local item and notifies). A mutation for an entity without a handler is rejected with `SYNC_ENTITY_UNKNOWN`.
5. The handler reports every change it made, cascades included; the engine records them all in the change log in the same transaction.
6. The cursor follows commit order per owner: the change log is written under a per-owner lock, so a pull never skips a change that committed after an earlier cursor was returned (ADR 0032).
7. Pull collapses the changes after the cursor per entity: the last one wins. A deletion, or an entity that is no longer live, is delivered as a tombstone (entity and id, no row content); otherwise the current state is delivered.
8. A pull page holds at most 500 changes; `more` is true when there are further changes after the returned `cursor`.
9. An owner never receives or affects another owner's changes or processed mutations (ADR 0016).
10. Both routes answer 401 `UNAUTHENTICATED` without a session; push also checks the `Origin` (403 `FORBIDDEN_ORIGIN`), since it changes state with a cookie.
11. Push takes 1 to 100 mutations; `mutationId` is a UUID, `entity` a non-empty string, `op` is `upsert` or `delete`, `data` an object. The body is at most 1 MiB. Anything else answers 400 `VALIDATION_FAILED` (413 `PAYLOAD_TOO_LARGE` for the size) and applies nothing; a client with more than 100 pending mutations sends several pushes.
12. `since` on pull is a non-negative integer; absent means 0 (first sync). Anything else answers 400 `VALIDATION_FAILED`.
13. A mutation on an entity of another owner is `rejected` with `NOT_FOUND`, like a missing one (ADR 0016).

## Acceptance criteria
- [ ] **AC-1** Given a batch of 10 highlight mutations whose response was lost, when the same batch is pushed again, then each highlight exists once on the server.
- [ ] **AC-2** Given the same batch is pushed twice, then the second push changes nothing and returns `duplicate`.
- [ ] **AC-4** Given two transactions of the same owner committing in the order opposite to their start, when a client pulls between the commits and again after, then no change is skipped.
- [ ] **AC-5** Given a batch of mutations, then they are applied in batch order, and a rejected one does not stop the others.
- [ ] **AC-6** Given a mutation the handler rejects, then the result is `rejected` with the error `code`, nothing it wrote persists, and resending it returns `rejected` with the same code.
- [ ] **AC-7** Given several changes to one entity after the cursor, when a client pulls, then the entity appears once with its latest state and the cursor reaches the last change.
- [ ] **AC-8** Given more than 500 changes after the cursor, when a client pulls repeatedly from each returned cursor, then every change arrives once, in order, and `more` is false on the last page.
- [ ] **AC-9** Given a deleted entity, or an upsert whose entity is no longer live, when a client pulls, then it receives a tombstone and no row content.
- [ ] **AC-10** Given a handler that reports an entity and a cascaded child, then both appear in the next pull.
- [ ] **AC-11** Given a mutation for an entity without a handler, then it is `rejected` with `SYNC_ENTITY_UNKNOWN`.
- [ ] **AC-12** Given two owners using the same `mutationId`, then both are applied, and neither sees the other's changes in a pull.
- [ ] **AC-13** Given no session, when push or pull is called, then 401 `UNAUTHENTICATED` and nothing is applied.
- [ ] **AC-14** Given a push whose `Origin` is foreign or missing, then 403 `FORBIDDEN_ORIGIN` and nothing is applied.
- [ ] **AC-15** Given a push that is not JSON, has a malformed mutation, an empty batch, 101 mutations or a body over 1 MiB, then 400 `VALIDATION_FAILED` (413 for the size) and nothing is applied.
- [ ] **AC-16** Given a signed-in user, when they push mutations and pull from cursor 0 and push the same batch again, then the pull returns the entities with the cursor of the push, and the second push answers `duplicate`.
- [ ] **AC-17** Given a `since` that is negative, fractional or not a number, then 400 `VALIDATION_FAILED`; given no `since`, then the pull starts at 0.
- [ ] **AC-18** Given a mutation on an entity id that belongs to another user, then it is `rejected` with `NOT_FOUND`, the other user's data is unchanged, and the other user's pull does not show it.

AC-3 (two browsers, < 2 s) moved to `sync/events`; a retired criterion keeps its number.

## Open questions
- Client durability, leader tab and SSE: `docs/pending/P-007` (points 2 and 5), spec `sync/events`.
- Compaction horizon and `reset`: `docs/pending/P-007` (point 1), spec `sync/compaction`.
