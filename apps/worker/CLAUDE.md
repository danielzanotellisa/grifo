# apps/worker

Node process running background jobs with Graphile Worker on Postgres (ADR 0007, 0020, 0029). Same modules as the web app, different entry point.

## Layout
- `src/index.ts` — `run()` with the task list and the crontab. Task names mirror `TaskName` in `@app/platform`.
- One file per task under `src/tasks/` as they get implemented.

## Rules
- Jobs are enqueued only through `enqueueJob(tx, …)` from `@app/platform`, inside the transaction of the write that caused them. Never enqueue after commit.
- A payload always carries `ownerId`; the handler runs inside `withUser(db, ownerId, …)` like a request. Only admin tasks (purge, restore test, integrity check) use the migrator connection, and only for what RLS forbids.
- The authentication tasks (`auth.sendEmail`, `auth.expireMail`) are the exception: they read the `identity` schema, which only the authentication role can, so they use the `DATABASE_AUTH_URL` pool instead of `withUser` (ADR 0035). Their payload holds ids only, never a link or token, because the job tables are readable by the application role.
- Handlers are idempotent: running a job twice gives the same result (output keys derive from ids, writes are upserts). Use `jobKey` to deduplicate pending jobs.
- Never hold a database transaction open during slow work (rendering, scanning, packaging). Read → work → write.
- On finish or final failure, update the entity status and `recordChange`, so the client learns through sync/SSE. Throwing makes Graphile retry (max 4 attempts in total); after the last attempt mark the entity FAILED with a user-facing code.
- Scheduled jobs live in the crontab in `src/index.ts`, nowhere else.
- Never execute content from PDFs. Summary rendering goes to Gotenberg with JavaScript disabled; HTML is built only from escaped user text.
- `auth.sendEmail` reads the outbox row, sends the plain-text message through SMTP (`nodemailer`; `SMTP_HOST`, `SMTP_PORT`, optional `SMTP_USER` and `SMTP_PASSWORD`, `MAIL_FROM`) and deletes the row; a missing row ends the job, a failed send throws so Graphile retries. `auth.expireMail` runs hourly and deletes rows older than 24 hours. The wording is a pt-BR stopgap (`tasks/mail-text.ts`) until the i18n library is chosen (P-009).
- The worker connects as `app_user` and must be able to enqueue and run jobs, which needs the policies that `db/sql/rls.sql` creates on the private Graphile tables (RLS is on there and ships no policy).
- The Graphile schema is installed by `pnpm db:setup` (or `pnpm db:queue` alone) with the migrator role; the worker itself runs as `app_user`.
