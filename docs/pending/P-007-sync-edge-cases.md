# P-007. Sync edge cases

- Status: open
- Blocks: approving `_cross-cutting/sync/events` and `_cross-cutting/sync/compaction` (the server core in `_cross-cutting/sync` is approved)
- Related: ADR 0015, ADR 0032, specs `_cross-cutting/sync`, `sync/events`, `sync/compaction`

## Open points
1. Change log compaction horizon (e.g. 90 days) and the `reset` flow on the client.
2. Leader-tab election for the single SSE connection (Web Locks API vs BroadcastChannel heartbeat) and what happens when the leader closes.
3. ~~Ordering of dependent mutations in one batch~~ Decided: push preserves batch order (`_cross-cutting/sync` rule 2).
4. ~~`PARENT_DELETED`~~ Decided for the server: the handler rejects and the result carries the code (rule 4). The client UX is in `sync/events`.
5. IndexedDB quota exceeded or storage evicted by the browser: request persistent storage (`navigator.storage.persist()`) and show a warning when refused.
6. ~~Clock-free conflict rule~~ Decided: arrival order, last arrival wins per entity, delete wins (rule 2).

## How to close
Points 1, 2 and 5 are decided in `sync/compaction` and `sync/events`; add tests for them when those specs are approved.
