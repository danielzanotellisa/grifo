# P-002. Job queue library

- Status: decided → ADR 0029 (Graphile Worker)
- Blocks: worker tasks, exports, deep scan, purge
- Related: ADR 0007, 0020

## Problem
A Postgres-backed queue for TypeScript with retries, backoff, scheduling and, ideally, enqueueing inside the same transaction as the domain write.

## Options
| Option | Strengths | Weaknesses |
| --- | --- | --- |
| **Graphile Worker** | Enqueue from SQL (`graphile_worker.add_job(...)`) inside any transaction, so the job exists only if the write commits; LISTEN/NOTIFY gives millisecond pickup; job keys for dedup; cron; manages its own schema | No built-in dashboard; lower peak throughput than Redis queues (irrelevant at this scale) |
| **pg-boss** | Mature, simple API, retries/backoff/cron/throttling, dead-letter queues | Transactional enqueue needs care to run on the same connection as the domain transaction; polling-based by default |
| Own table + `SKIP LOCKED` | Full control, no dependency | Retries, backoff, scheduling, stuck-job recovery all hand-written |
| BullMQ | Richest features and dashboards | Needs Redis — contradicts ADR 0007 |
| Inngest / Trigger.dev | Workflows, observability | Extra platform to run; heavy for local-first Docker setup |

## Recommendation
**Graphile Worker**: transactional enqueue matches ADR 0020 exactly ("Export row and job in the same transaction"), and LISTEN/NOTIFY fits the SSE latency goals.

## How to close
Spike: enqueue inside a Drizzle transaction via `sql\`select graphile_worker.add_job(...)\``, roll back once and confirm no job exists; check MIT license; write the ADR.
