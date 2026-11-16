# Module: export

Everything the user downloads: summary PDF, annotated PDF, flashcard decks (.apkg), full data export. Schema: `export`. Specs: `docs/specs/export/`, `docs/specs/summary-template/`, `docs/specs/deck/`.

## Owns
- `Export` (table `exports`). `SummaryTemplate`s are versioned code in this module, not data.

## Public API (`src/index.ts`)
- Types and state machine, `NOTE_TYPE`, `stableIntId`, `html`/`escapeHtml`/`rawHtml`, `renderPdf`.

## Rules
- Every export is a job (ADR 0020): the request creates the `Export` row and calls `enqueueJob` in the same transaction, then returns the id. Progress and completion reach the client over SSE.
- Jobs render from a snapshot (the sync cursor at request time); edits during generation never leak in.
- Output goes to the `derived` bucket under a key derived from the export id, so retries overwrite.
- Exported PDFs carry no active content (`/JavaScript`, `/OpenAction`, `/AA`, `/Launch`, embedded files) (ADR 0017).
- Each export records template id + version, so old summaries regenerate identically.
- Every export kind passes `EntitlementPolicy` (currently allows all).

## Summary PDF (ADR 0028)
- HTML/CSS templates rendered by Gotenberg (Chromium, JavaScript disabled). Build HTML only with the `html` tagged template; never concatenate user text into markup.
- Templates are self-contained: fonts and images go as extra files to Gotenberg, nothing loads from the network.
- Page size and margins come from CSS `@page` (`preferCssPageSize`).

## Flashcard decks (ADR 0027)
- `.apkg` generated in the worker by our own generator (SQLite via sql.js + zip via fflate), modeled on the format produced by Python's genanki. Do not add genanki-js or mkanki: they are AGPL (ADR 0012).
- One note type, `NOTE_TYPE` ("Grifo Basic"), frozen forever (id, name, fields Front, Back, Source). A new layout = a new note type + ADR.
- Note GUID = `ankiGuid(flashcard.id)`; deck = `deckName(subject, document)`; deck ids = `stableIntId(deckName)`.
- Verification against Anki desktop, AnkiDroid and Noji is tracked in `docs/pending/P-011`.

## Depends on
- `@app/platform`, `@app/library`, `@app/annotation`, `@app/outline`, `@app/study` (read-only use of their public APIs).
