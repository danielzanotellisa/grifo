# Running everything locally with Docker — spec

- Status: approved
- Modules: infra, apps/web, apps/worker, apps/e2e
- ADRs: 0019, 0026, 0038, 0042

## Definition
One command, on a machine that has only Docker, starts the whole application and leaves it usable in the browser at `http://localhost:3000`. This is the way the project is meant to be used for now; hosting is out of scope.

## Rules
1. From a clean clone, with no `.env` and no volumes, `docker compose --profile app up -d --build` starts everything: Postgres, the S3-compatible storage with its buckets, Mailpit, ClamAV, Gotenberg, a one-shot `migrate` service, the web app and the worker.
2. `migrate` runs the database setup (roles, migrations, queue schema, RLS: `pnpm db:setup`) as the admin role and exits. `web` and `worker` start only after it ended successfully, so a first start never meets an empty database.
3. The compose file carries local defaults for every setting, including the secret of the authentication library, so no `.env` is needed; a `.env` next to it overrides them. The default secret is for local use only.
4. Data lives in named volumes (database, storage, ClamAV signatures). `docker compose stop`, `down` and a restart keep it; only `down -v` erases it, and the README says so.
5. The web service answers `GET /api/health`; compose uses it as its health check.
6. The sign-up mail of a new account is read in Mailpit at `http://localhost:8025` (the verification link, ADR 0034). The README says so.
7. ClamAV downloads its signatures the first time and takes a few minutes; until it is ready, documents are validated but not scanned (ADR 0038). The README says so. Neither `web` nor `worker` waits for it.
8. The build context leaves out `node_modules`, `.next`, `.git`, test output and spike dependencies (`.dockerignore`), so the images do not copy the host's binaries.
9. The development flow does not change: `docker compose up -d` starts only the infrastructure and `pnpm dev` runs web and worker on the host.
10. The browser tests of ADR 0042 can run against the running stack instead of starting their own servers, and the CI job `End-to-end tests` does that: it builds the images, starts the stack from a clean state and runs the suite.

## Acceptance criteria
- [ ] **AC-1** Given the stack started with the one command from a clean state, then `migrate` ended successfully, `GET /api/health` answers 200, the sign-in screen is served, and the sign-up mail of a new account reaches Mailpit through the worker.

## Open questions
- Skipping the email confirmation for a person who runs the app alone is a possible follow-up (it changes `user#AC-5`, so it needs its own spec); today the confirmation goes through Mailpit.
- The worker image runs TypeScript through `tsx`; a compiled build and images pinned by digest (`P-010`) wait for a deploy outside this machine.
