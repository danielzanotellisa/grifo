# 0020. Summaries and exports run as asynchronous jobs

- Status: accepted
- Date: 2026-11-15

## Context
Generating a summary PDF, an annotated PDF or a full data export can take seconds to minutes. Doing it inside an HTTP request blocks the UI and hits timeouts.

## Decision
Every export is an `Export` entity processed by a job: `QUEUED → RUNNING → SUCCEEDED | FAILED`.
1. The request creates the `Export` and enqueues the job in the same transaction, then returns the id immediately.
2. The worker claims the job (`SKIP LOCKED`), generates the file and writes it to the derived bucket under a key derived from the export id (retries overwrite, never duplicate).
3. Progress, completion and failure reach the browser over SSE (0015).
4. Up to 3 retries with backoff, then a visible error with "try again".
5. The job renders a snapshot: the sync cursor at request time.

All export kinds use this path; small ones finish in under a second. Summary PDFs render from a versioned `SummaryTemplate`; each `Export` records template id and version. The renderer is open (P-001). Paid templates, if ever, go through `EntitlementPolicy`.

## Considered options
- Synchronous generation: blocking and timeouts.
- Browser-side summary rendering: rich layouts are more predictable in a controlled server environment.

## Consequences
Files stay available 30 days and can always be regenerated. The UI needs an "Exports" area with status and history. Templates are prototyped before becoming code.
