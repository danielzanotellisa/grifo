# 0029. Job queue: Graphile Worker

- Status: accepted
- Date: 2026-11-15
- Related: 0007, 0020

## Context
0020 requires creating an `Export` and its job in the same transaction; 0007 keeps everything in Postgres; 0014 wants export notifications in under 2 s.

## Decision
Graphile Worker (MIT). Jobs are enqueued with `graphile_worker.add_job(...)` through `enqueueJob(tx, …)` inside the domain transaction, so a rolled-back write never leaves a job behind. Workers pick jobs up via LISTEN/NOTIFY. `max_attempts = 4` (first run + 3 retries, exponential backoff); `job_key` deduplicates pending jobs. Scheduled tasks (purge, integrity check, restore drill) use Graphile's crontab. The schema is installed by the migrator role (`pnpm db:queue`); web and worker use `app_user` with explicit grants.

## Considered options
- pg-boss: mature, but transactional enqueue needs extra care to share the connection.
- Own `SKIP LOCKED` table: retries, backoff, scheduling and stuck-job recovery by hand.
- BullMQ: requires Redis (contradicts 0007).

## Consequences
No built-in dashboard; job state is queryable with SQL when needed. Closes P-002.
