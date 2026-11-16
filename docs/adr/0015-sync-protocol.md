# 0015. Sync protocol: push/pull with a cursor, SSE for notifications

- Status: accepted
- Date: 2026-11-15
- Related: 0006, 0007

## Context
SSE was proposed to guarantee consistency. SSE is one-way (server → browser): good for "something changed" and "your export is ready", but it does not carry client changes to the server, and events sent while disconnected are lost unless the client can ask for "everything since X". Consistency comes from the protocol; SSE is the doorbell.

## Decision
1. **Push** `POST /api/sync/push`: a batch of outbox mutations, each with `mutationId`, entity, op (`upsert`/`delete`) and data. Processed ids are recorded, so resending a batch is harmless. The response gives a per-mutation outcome and the current cursor.
2. **Pull** `GET /api/sync/pull?since=<cursor>`: every change for the user after the cursor, including deletions. Each server write appends to a per-user change log in the same transaction; its sequence number is the cursor.
3. **Events** `GET /api/events` (SSE): `sync` (new cursor) and `export` (job progress/finished/failed). Event `id` = cursor, so the browser's automatic `Last-Event-ID` resumes correctly. Heartbeat comment every 25 s. Across processes, notifications travel through `LISTEN/NOTIFY`.

Conflicts: the client clock is not trusted; the server applies mutations in arrival order (last arrival wins per entity). Delete beats a concurrent edit. A mutation on something whose parent was deleted is rejected with `PARENT_DELETED`; the client drops it and tells the user. Multiple tabs: one leader tab holds the SSE connection and relays through `BroadcastChannel`.

## Considered options
- SSE only: see context.
- WebSocket: bidirectional not needed; SSE is plain HTTP and reconnects on its own.
- Polling: kept as fallback when SSE is blocked.

## Consequences
Pull alone guarantees convergence; SSE only cuts latency below 2 s. The change log needs compaction; very old cursors get a "full reload" response.
