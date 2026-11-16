# Sync client flow and events — spec

- Status: draft
- Modules: web (client), platform
- ADRs: 0006, 0014, 0015

## Definition
How the browser records, sends and receives changes: the outbox, the SSE notification and the leader tab. The server contract is in `_cross-cutting/sync`.

## Client
1. Every mutation: apply to state → write entity + outbox entry to IndexedDB in one IndexedDB transaction → show "saved on this device".
2. Outbox flush: debounce ~1 s, on `visibilitychange`/`pagehide`, on reconnect, on app start.
3. After a successful push: mark entries done, store the returned cursor.
4. On SSE `sync` with a cursor greater than the local one, or on reconnect: pull since the local cursor, repeating while `more` is true.

## API
- `GET /api/events` (SSE) → `event: sync` / `event: export`, `id: <cursor>`, heartbeat every 25 s.

## Rules
1. One SSE connection per browser (leader tab + BroadcastChannel).

## Acceptance criteria
- [ ] **AC-1** Given the network drops after 10 highlights, when it returns, then all 10 reach the server exactly once.
- [ ] **AC-2** Given two open browsers, then a highlight made in one appears in the other in < 2 s.

## Open questions
- Leader-tab election (Web Locks API versus BroadcastChannel heartbeat) and what happens when the leader closes: `docs/pending/P-007` point 2.
- IndexedDB quota or eviction: `docs/pending/P-007` point 5.
