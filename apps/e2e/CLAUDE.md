# apps/e2e

Browser tests with Playwright (ADR 0042): a real Chromium drives a production build of the web app, with the worker, Postgres, the S3-compatible storage and Mailpit behind it. They check the flows the specs describe; business rules are tested where they live.

## Run
- `docker compose up -d` (Postgres, storage, Mailpit), then `pnpm e2e` from the repository root. The config builds and starts the web app on port 3100, `src/global-setup.ts` prepares the database and the buckets and starts the worker, and `src/env.ts` holds the local defaults (CI sets its own).
- The first time, `pnpm --filter @app/e2e exec playwright install chromium`.
- A failure keeps a trace, a screenshot and an HTML report (`apps/e2e/test-results`, `playwright-report`; `pnpm --filter @app/e2e exec playwright show-trace <trace.zip>`).

## Layout
- `tests/*.spec.ts` — one file per area: `auth`, `subjects`, `documents`, `reader`. Names start with `[e2e]`.
- `src/fixtures.ts` — `test` with `signedIn` (a page with a fresh confirmed account signed in through the API) and `page` already given its own client address.
- `src/account.ts`, `src/mail.ts` — accounts through the API and the confirmation link read from Mailpit. `src/pdfs.ts` — the PDFs: the plain and encrypted ones are the worker's fixtures, the hostile one has JavaScript in its `/OpenAction`.

## Rules
- Every test makes its own account; never share one or clean the database. The authentication routes are rate limited per client address, so a page gets its own `x-real-ip`; apply it only to same-origin `/api` calls (`withOwnClientIp`), never to the storage, which is another origin.
- Next adds its own `role="alert"` (`#__next-route-announcer__`) to every page: select the alerts of the app by excluding it.
- Wait on what the page shows (`expect(...).toHaveText`), not on timers. The one fixed wait is the hostile PDF, to give a script time to open a dialog it must never open.
- The tests read the pt-BR texts of the screens: a changed message changes a test.
