# apps/web

Next.js app: the React UI (reader, outline editor, flashcards) and the HTTP API as Route Handlers. Self-hosted Node runtime; never deploy to serverless (SSE + LISTEN/NOTIFY need long-lived processes).

## Layout
- `src/app/` — routes. `src/app/api/**/route.ts` = HTTP adapters.
- `src/features/<feature>/` — UI by feature (reader, outline, flashcards, exports).
- `src/local/` — local-first store (IndexedDB via Dexie) and the outbox (ADR 0006, 0015).
- `src/lib/http/` — Problem Details mapping, auth guard, request parsing.
- `src/composition.ts` — the only place that wires db, event handlers and entitlements.

## Route Handler rules
- Every handler: `export const runtime = "nodejs"`; dynamic routes `force-dynamic`.
- Shape: authenticate → validate input → `withUser(db, userId, tx => module.useCase(tx, …))` → map result. No business rules here.
- Errors leave through `toProblemResponse`. Another user's resource → 404.
- Long work → enqueue a job and return `202` with the export/job id. Never generate files inside a request.
- SSE (`/api/events`): one stream per browser (the leader tab shares it via BroadcastChannel); event `id` = sync cursor; heartbeat comment every 25 s.

## UI rules
- Every user mutation: write to IndexedDB and the outbox first, then update UI state. The UI shows "saved on this device" / "synced", never "saved" before IndexedDB commits.
- The reader talks to the PDF engine only through `features/reader/pdf-engine.ts`. Engine-specific code stays behind that port.
- PDF rendering runs in a Web Worker; never enable eval or PDF JavaScript in the engine.
- Highlight geometry is converted between screen and PDF points only at the engine boundary.
- Keyboard first: category shortcuts 1–9, right-click menu on selections and highlights.
- No hard-coded UI strings; use i18n keys (pt-BR is the default locale).
- No `localStorage` for user data: IndexedDB only.
- No Server Actions for domain mutations: every mutation goes through the sync push endpoint (ADR 0022).
