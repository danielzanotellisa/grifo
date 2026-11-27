# apps/web

Next.js app: the React UI (reader, outline editor, flashcards) and the HTTP API as Route Handlers. Self-hosted Node runtime; never deploy to serverless (SSE + LISTEN/NOTIFY need long-lived processes).

## Layout
- `src/app/` — routes. `src/app/api/**/route.ts` = HTTP adapters.
- `src/features/<feature>/` — UI by feature (reader, outline, flashcards, exports).
- `src/local/` — local-first store (IndexedDB via Dexie) and the outbox (ADR 0006, 0015).
- `src/lib/http/` — Problem Details mapping (`problem.ts`), the bounded JSON body reader (`body.ts`), the Zod schemas of the request envelopes (`schemas.ts`, ADR 0036), the auth guard (`auth-guard.ts`), the origin check for our own state-changing routes (`same-origin.ts`) and the mapping of the authentication library's errors (`auth-problem.ts`).
- `src/i18n/request.ts` and `messages/pt-BR.json` — the one locale and every UI string (next-intl, ADR 0041). `src/app/globals.css` imports Tailwind.
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
- The default category names (`lib/i18n/category-names.ts`) are a stopgap that moves to `messages/pt-BR.json` now that next-intl is chosen (ADR 0041).
- Every route is tested for no session (401) and, when it addresses a resource, for another user's resource (404).

## Sync and trash routes (ADR 0036)
- `POST /api/sync/push` and `GET /api/sync/pull` call the sync engine; `GET /api/trash` and `POST /api/trash/{id}/restore` call the trash. Specs: `_cross-cutting/sync`, `_cross-cutting/soft-delete`.
- Push and restore check the `Origin`; a push is 1 to 100 mutations and at most 1 MiB, read through `readJsonBody` so an oversized body is never fully buffered. The `data` of a mutation is validated by the module that owns the entity, not here.
- Documents are created by the upload, not by sync: a test that needs one inserts it directly.

## Screens (spec `user/screens`)
- `/signup`, `/login` and `/` (the home redirects to `/login` without a session). The forms are client components in `src/features/auth/`; they call the authentication routes through `auth-client.ts` and pick the message of a failure by its stable `code` (`use-error-message.ts`), never by its text.
- `lib/session.ts` `currentUser(headers)` is what a page asks to know who is signed in; the page redirects on null.
- Component tests (`*.test.tsx`) run in jsdom under the Vitest `ui` project with the real pt-BR messages (`src/test/render.tsx`). Next adds its own `role="alert"` route announcer to the page, so a browser test must target `p[role="alert"]`, not every alert.

## Subjects and trash (spec `subject/screens`)
- `/` is the list of subjects and `/trash` the trash, both behind `AppShell` (`features/shell`) and a session check that redirects to `/login`. They talk straight to `/api/sync/pull`, `/api/sync/push` and `/api/trash`: no local database and no offline queue until `sync/events`.
- `features/subjects/subjects-client.ts` is the only code that calls those routes: the list is a full pull where the last change of each entity wins; every change is one push of one mutation; a new subject id is a UUIDv7 made in the browser (`uuid`). Failures become stable codes, and `use-failure-message.ts` turns a code into a pt-BR message (a lost session goes to `/login`).
- `src/test/fake-api.ts` is an in-memory sync and trash API for the component tests, with `fail`, `rejectNext` and `holdNextPush` to force failures.

## Documents (spec `document/screens`)
- `/subjects/{id}` is the page of one subject: its documents, importing PDFs, rename and delete. Each subject name on `/` links to it. It talks straight to the API like the subject screens; there is no SSE, so the page pulls again every 2 seconds only while a document is `VALIDATING` (or `UPLOADED` and still being sent by this page) and stops when none is.
- `features/documents/documents-client.ts` does the import: SHA-256 in the browser (`crypto.subtle`), `POST /api/documents/uploads`, a `PUT` straight to the storage with the URL and headers returned (skipped when the server already has the bytes), then confirm. A failed `PUT` is the client code `UPLOAD_PUT_FAILED`. `lib/api.ts` holds what the subject and document clients share (`request`, `pullAll`, `pushMutation`, the `Result` and `Failure` types).
- The title of a document is the file name without `.pdf`, cut to 200 characters; a document `UPLOADED` that this page is not sending shows as "Envio incompleto".
- `FakeApi` also serves the upload routes and a fake storage host (`storage.test`); `finish(id, change)` plays the validation job, `holdNextPut()` holds a storage upload.

## Reader (spec `document/reader`)
- `/documents/{id}` is the reader. `features/reader/document-reader.tsx` holds the page logic (finding the document, the file URL, the bar, the keys) and talks to the engine only through the `Surface` of `reader-surface.ts` (`source`, `onState`, `controlsRef`). `embedpdf-surface.tsx` is the one place that knows EmbedPDF 3.4.0; `reader-page.tsx` loads it on the client only (`dynamic`, no SSR) because the engine needs WebAssembly and workers.
- The surface registers only the stage, render, interaction and selection plugins (ADR 0040). Never register the actions, form or JavaScript plugins: a PDF's JavaScript must never run. The area is focusable and the adapter scrolls it with the arrows, Page Up, Page Down, Home and End.
- Component tests use `test/fake-surface.tsx`, which records what the page asks and reports the states a test emits; the real engine is checked in a real browser and by `spikes/pdf-engine/checks`, not in CI. Upgrading `@embedpdf/*` means rerunning those checks and the reader by hand.
- `features/reader/pdf-engine.ts` is the other, older port (selection and re-anchoring for the highlights slice); the reader surface does not use it.

## Document routes (ADR 0037)
- `POST /api/documents/uploads` (start), `POST /api/documents/{id}/confirm` and `GET /api/documents/{id}/file` call `getUploads()` (built on first use, so the storage settings are only needed when someone uploads). Spec: `document/upload`.
- The bytes never pass through the app: the browser PUTs to the presigned URL with the returned headers. `S3_PUBLIC_ENDPOINT` is the address the browser reaches the storage at, when it differs from `S3_ENDPOINT`.
- Start and confirm check the `Origin`; a path id that is not a UUID answers 404.

## UI rules
- Every user mutation: write to IndexedDB and the outbox first, then update UI state. The UI shows "saved on this device" / "synced", never "saved" before IndexedDB commits.
- The reader talks to the PDF engine only through the `Surface` of `features/reader/reader-surface.ts` (and the selection and re-anchoring port `pdf-engine.ts` once the highlights need it). Engine-specific code stays behind them.
- PDF rendering runs in a Web Worker; never enable eval or PDF JavaScript in the engine.
- Highlight geometry is converted between screen and PDF points only at the engine boundary.
- Keyboard first: category shortcuts 1–9, right-click menu on selections and highlights.
- No hard-coded UI strings: add a key to `messages/pt-BR.json` and read it with `getTranslations` (server) or `useTranslations` (client). Style with Tailwind utility classes (ADR 0041).
- No `localStorage` for user data: IndexedDB only.
- No Server Actions for domain mutations: every mutation goes through the sync push endpoint (ADR 0022).
