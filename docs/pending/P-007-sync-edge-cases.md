# P-007. Sync edge cases

- Status: open
- Blocks: approving the sync spec
- Related: ADR 0015, spec `_cross-cutting/sync`

## Open points
1. Change log compaction horizon (e.g. 90 days) and the `reset` flow on the client.
2. Leader-tab election for the single SSE connection (Web Locks API vs BroadcastChannel heartbeat) and what happens when the leader closes.
3. Ordering of dependent mutations in one batch (highlight + its node + a flashcard): push must preserve outbox order.
4. A document deleted on device A while device B has pending highlights for it (`PARENT_DELETED` UX).
5. IndexedDB quota exceeded or storage evicted by the browser: request persistent storage (`navigator.storage.persist()`) and show a warning when refused.
6. Clock-free conflict rule vs. a user editing the same node on two devices within seconds.

## How to close
Decide each point in the sync spec; add tests for 1, 3, 4, 5.
