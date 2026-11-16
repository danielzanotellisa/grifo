# CLAUDE.md — Grifo

Grifo is a web app (desktop browsers) for studying PDFs: users import PDFs into **subjects**, **highlight** passages, organize highlights into an **outline** (the summary), turn **definitions** into **flashcards**, and export summaries (PDF) and flashcard decks (.apkg for Anki/Noji). Single developer, spec-driven development.

## Source of truth, in this order
1. `docs/adr/` — *why*. Accepted ADRs are immutable; to change a decision, write a new ADR that supersedes the old one.
2. `docs/specs/` — *what*. One folder per entity, cross-cutting specs in `docs/specs/_cross-cutting/`. Vocabulary in `docs/specs/glossary.md`.
3. Code.

Code that disagrees with a spec is a bug. A spec that contradicts an ADR is blocked: stop and propose a new ADR.

## Workflow
- Before changing anything, read the relevant spec and the CLAUDE.md of the app/module you are touching.
- Behavior with no spec → extend the spec first and ask for approval, then implement.
- Unknowns, gaps and deferred decisions go to `docs/pending/` (template inside). Never silently guess on an open pending item; say it is blocked.
- A change is done when it has code + tests + updated spec (+ an ADR if it changes architecture).

## Commits and PRs
- `main` accepts changes only through a merged PR (GitHub ruleset, ADR 0031). Never push to it.
- Work in a git worktree, not in the main checkout: `git worktree add ../grifo-worktrees/<slug> -b <type>/<slug> origin/main`, then `pnpm install` inside it (installs the husky hooks). Keep the main checkout on `main`, clean. Remove with `git worktree remove` after the PR merges.
- Commit format `<type>(<scope>): <description>`, enforced by commitlint in the husky `commit-msg` hook and again in CI. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Scope is optional and must be one of those in `commitlint.config.js` (module, app, `db`, `infra`, `docs`, `ci`, `deps`). Lowercase subject.
- `feat` and `fix` commits end with a footer `Spec: <spec-id>[#AC-n], …` or `Spec: n/a`.
- Every PR fills `.github/pull_request_template.md`: `Spec:` (spec id, optionally `#AC-n`) and `ADR:` (`ADR-NNNN`), or an explicit `n/a`. CI validates both against the repo.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, `pnpm trace`, tests, the husky wiring check, commitlint over the PR's commits and the PR-body check. A red CI blocks merge. A new required check must also be added to the ruleset.

## Traceability (ADR 0030)
- Spec id = path under `docs/specs` without `README.md`/`.md` (`highlight`, `_cross-cutting/sync`). Acceptance criteria are `**AC-n**`, numbered once, never renumbered.
- Reference a criterion as `<spec-id>#AC-n`: in the test name (`it("[highlight#AC-1] creates a highlight", …)`), and in a short comment in code when it helps.
- `pnpm trace` fails on unknown references and on any `approved` criterion without a test. Implement only `approved` specs, so every criterion gets a test before the PR merges.

## Repo map
- `apps/web` — Next.js: React UI and Route Handlers (thin HTTP adapters, SSE).
- `apps/worker` — Node process that runs background jobs (scans, exports, purge).
- `packages/platform` — shared infrastructure: db client, `withUser` (RLS), sync change log, errors, ids, storage port, entitlements, shared kernel types.
- `packages/modules/*` — domain modules: identity, library, annotation, outline, study, export.
- `docs/` — adr, specs, pending, architecture (C4).
- `infra/`, `db/` — compose support files, migrations, RLS SQL.

## Architecture rules (non-negotiable)
- Modular monolith. Import another module only from its package root (`@app/<module>`), never from its internals.
- Each module owns one Postgres schema. No queries, joins or foreign keys across schemas; cross-module references are plain UUID columns.
- Business rules live in modules. React components and Route Handlers only parse input, call a module, and map the result.
- Every user-owned row has `owner_id`. Request and job code reaches the database only through `withUser(db, userId, tx => …)`. The migrator connection is for migrations and admin jobs only.
- Original PDFs (`StoredFile`) are never modified. Generated files go to the derived bucket.
- Deletes are soft (`deleted_at`); only the purge job deletes physically.
- Every write the client must see appends to the change log in the same transaction. Mutations are idempotent by `mutationId`.
- IDs are UUIDv7; user-created entities get their id on the client.
- Anything slow (scan, export, OCR, purge) is a Graphile Worker job, enqueued with `enqueueJob` inside the transaction that caused it. Never work inside a request.
- Durability floor: the UI never says "saved" before the data is in IndexedDB.

## Conventions
- Product name: **Grifo** (UI and docs). Package scope stays `@app/*`.
- English for code, identifiers, commits and docs. UI text is pt-BR through i18n keys, never hard-coded.
- Use the glossary names. No synonyms: not Annotation for Highlight, not Course for Subject, not Card for Flashcard.
- API errors use RFC 9457 Problem Details with a stable `code`.
- Highlight geometry is stored in PDF user-space points (origin bottom-left). Convert only at the viewer boundary.
- Timestamps are UTC; APIs use ISO-8601.
- Access to another user's resource returns 404, never 403.

## Security
- Every PDF is hostile input. Never execute PDF JavaScript or actions; render in a Web Worker; keep eval disabled in the PDF engine.
- No AGPL/GPL dependencies. Check the license before adding any package.
- Secrets only through environment variables.

## Testing
- Test runner is Vitest (ADR 0031); do not add Jest.
- Domain rules: unit tests inside the module.
- Every route: tests for unauthenticated access and for another user's resource (expect 404).
- Sync and durability: tests that drop the network or reload mid-sync must not lose data.

## Commands
- `docker compose up -d` — infra (Postgres, S3, ClamAV, Mailpit, Gotenberg)
- `pnpm dev` — web + worker
- `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm format` · `pnpm trace`
- Do not bump or re-add `typescript`: it is aliased to the TS 6 API for ESLint/Next, and `@typescript/native` provides the TS 7 `tsc` (ADR 0031).
- `pnpm install` — also installs the git hooks (husky, via `prepare`)
- `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:queue` · `pnpm db:rls`
