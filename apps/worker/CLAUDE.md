# apps/worker

Node process running background jobs with Graphile Worker on Postgres (ADR 0007, 0020, 0029). Same modules as the web app, different entry point.

## Layout
- `src/index.ts` — `run()` with the task list and the crontab. Task names mirror `TaskName` in `@app/platform`.
- One file per task under `src/tasks/` as they get implemented.

## Rules
- Jobs are enqueued only through `enqueueJob(tx, …)` from `@app/platform`, inside the transaction of the write that caused them. Never enqueue after commit.
- A payload always carries `ownerId`; the handler runs inside `withUser(db, ownerId, …)` like a request. Only admin tasks (purge, restore test, integrity check) use the migrator connection, and only for what RLS forbids.
- Handlers are idempotent: running a job twice gives the same result (output keys derive from ids, writes are upserts). Use `jobKey` to deduplicate pending jobs.
- Never hold a database transaction open during slow work (rendering, scanning, packaging). Read → work → write.
- On finish or final failure, update the entity status and `recordChange`, so the client learns through sync/SSE. Throwing makes Graphile retry (max 4 attempts in total); after the last attempt mark the entity FAILED with a user-facing code.
- Scheduled jobs live in the crontab in `src/index.ts`, nowhere else.
- Never execute content from PDFs. Summary rendering goes to Gotenberg with JavaScript disabled; HTML is built only from escaped user text.
- The Graphile schema is installed by `pnpm db:queue` with the migrator role; the worker itself runs as `app_user`.
