# 0006. Local-first client with an outbox

- Status: accepted
- Date: 2026-11-15
- Related: 0014, 0015

## Context
No highlight may be lost if the browser closes, the network drops or the server is down.

## Decision
Every change (highlight, outline node, flashcard) is applied to UI state and written to IndexedDB immediately, then queued in a persistent outbox. The outbox is sent in batches with a short debounce, on `visibilitychange`/`pagehide`, and retried on reconnect or next app start. IDs are client-generated UUIDv7; mutations are idempotent; soft deletes so deletions sync too. The PDF is cached locally for instant reopen and offline reading.

## Considered options
- Server-only saves: network dependency at the moment of highlighting.
- Off-the-shelf sync engines (PowerSync, ElectricSQL, RxDB): deferred; the domain is simple enough for an own outbox.

## Consequences
UI shows "saved on this device" / "synced". The sync contract is central and gets its own spec and tests.
