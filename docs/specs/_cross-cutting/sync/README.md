# Sync — spec

- Status: draft
- Modules: platform + every module with synced entities
- ADRs: 0006, 0014, 0015, 0032

## Definition
How client changes reach the server and other devices without loss.

## Client
1. Every mutation: apply to state → write entity + outbox entry to IndexedDB in one IndexedDB transaction → show "saved on this device".
2. Outbox flush: debounce ~1 s, on `visibilitychange`/`pagehide`, on reconnect, on app start.
3. After a successful push: mark entries done, store the returned cursor.
4. On SSE `sync` with a cursor greater than the local one, or on reconnect: pull since the local cursor.

## API
- `POST /api/sync/push` `{ mutations: [{ mutationId, entity, op, data }] }` → `{ results: [{ mutationId, status: "applied" | "duplicate" | "rejected", code? }], cursor }`
- `GET /api/sync/pull?since=<cursor>` → `{ changes: [{ entity, op, data }], cursor, reset?: true }`
- `GET /api/events` (SSE) → `event: sync` / `event: export`, `id: <cursor>`, heartbeat every 25 s.

## Rules
1. A `mutationId` is applied at most once per owner.
2. Server order = arrival order; last arrival wins per entity; delete wins over concurrent edit.
3. Parent deleted → `rejected` with `PARENT_DELETED`; the client removes the local item and notifies.
4. Cursors older than the compaction horizon get `reset: true` → the client reloads that user's data.
5. One SSE connection per browser (leader tab + BroadcastChannel).
6. The cursor follows commit order per owner: the change log is written under a per-owner lock, so a pull never skips a change that committed after an earlier cursor was returned (ADR 0032).

## Acceptance criteria
- [ ] **AC-1** Given the network drops after 10 highlights, when it returns, then all 10 reach the server exactly once.
- [ ] **AC-2** Given the same batch is pushed twice, then the second push changes nothing and returns `duplicate`.
- [ ] **AC-3** Given two open browsers, then a highlight made in one appears in the other in < 2 s.
- [ ] **AC-4** Given two transactions of the same owner committing in the order opposite to their start, when a client pulls between the commits and again after, then no change is skipped.

## Open questions
- Edge cases, compaction horizon, leader election details: `docs/pending/P-007`.
