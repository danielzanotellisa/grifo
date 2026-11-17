# apps/web

Next.js app: the React UI (reader, outline editor, flashcards) and the HTTP API as Route Handlers. Self-hosted Node runtime; never deploy to serverless (SSE + LISTEN/NOTIFY need long-lived processes).

## Layout
- `src/app/` — routes. `src/app/api/**/route.ts` = HTTP adapters.
- `src/features/<feature>/` — UI by feature (reader, outline, flashcards, exports).
- `src/local/` — local-first store (IndexedDB via Dexie) and the outbox (ADR 0006, 0015).
- `src/lib/http/` — Problem Details mapping (`problem.ts`), the bounded JSON body reader (`body.ts`), the Zod schemas of the request envelopes (`schemas.ts`, ADR 0036), the auth guard (`auth-guard.ts`), the origin check for our own state-changing routes (`same-origin.ts`) and the mapping of the authentication library's errors (`auth-problem.ts`).
- `src/composition.ts` — the only place that wires db, event handlers and entitlements.

## Route Handler rules
- Every handler: `export const runtime = "nodejs"`; dynamic routes `force-dynamic`.
- Shape: authenticate (`requireUser`) → validate input → `withUser(db, userId, tx => module.useCase(tx, …))` → map result. No business rules here.
- Errors leave through `toProblemResponse`. Another user's resource → 404.
- Long work → enqueue a job and return `202` with the export/job id. Never generate files inside a request.
- SSE (`/api/events`): one stream per browser (the leader tab shares it via BroadcastChannel); event `id` = sync cursor; heartbeat comment every 25 s.

## Authentication (ADR 0034)
- `/api/auth/*` is the authentication library, with its failures turned into Problem Details and the stable codes of `docs/specs/user`. `GET /api/me` and `POST /api/account/delete` are ours.
- A route that changes state with a session cookie and is not served by the library calls `assertSameOrigin` first; the library only protects its own routes.
- `getAuth()` (composition root) is built at startup by `instrumentation.ts`, so a missing `BETTER_AUTH_SECRET`, `APP_URL` or `DATABASE_AUTH_URL` stops the app early.
- Verification and reset emails are not sent by the web process: the callbacks write a row to the `identity` outbox and enqueue `auth.sendEmail` with only ids (ADR 0035). The job table is readable by the application role, so a link or token must never go into a payload. The worker sends the message.
- `POST /api/account/delete` is limited to 5 attempts per user in 15 minutes (`consumeRateLimit`, 429 `RATE_LIMITED` with `Retry-After`); the library limits only its own routes.
- The client IP for rate limiting is read from `x-real-ip`. The reverse proxy must set it and overwrite any value the client sent; never trust `X-Forwarded-For`.
- The default category names (`lib/i18n/category-names.ts`) are a stopgap until the i18n library is chosen (P-009).
- Every route is tested for no session (401) and, when it addresses a resource, for another user's resource (404).

## Sync and trash routes (ADR 0036)
- `POST /api/sync/push` and `GET /api/sync/pull` call the sync engine; `GET /api/trash` and `POST /api/trash/{id}/restore` call the trash. Specs: `_cross-cutting/sync`, `_cross-cutting/soft-delete`.
- Push and restore check the `Origin`; a push is 1 to 100 mutations and at most 1 MiB, read through `readJsonBody` so an oversized body is never fully buffered. The `data` of a mutation is validated by the module that owns the entity, not here.
- Documents are created by the upload, not by sync: a test that needs one inserts it directly.

## UI rules
- Every user mutation: write to IndexedDB and the outbox first, then update UI state. The UI shows "saved on this device" / "synced", never "saved" before IndexedDB commits.
- The reader talks to the PDF engine only through `features/reader/pdf-engine.ts`. Engine-specific code stays behind that port.
- PDF rendering runs in a Web Worker; never enable eval or PDF JavaScript in the engine.
- Highlight geometry is converted between screen and PDF points only at the engine boundary.
- Keyboard first: category shortcuts 1–9, right-click menu on selections and highlights.
- No hard-coded UI strings; use i18n keys (pt-BR is the default locale).
- No `localStorage` for user data: IndexedDB only.
- No Server Actions for domain mutations: every mutation goes through the sync push endpoint (ADR 0022).
