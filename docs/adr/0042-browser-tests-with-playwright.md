# 0042. Browser tests with Playwright

- Status: accepted
- Date: 2026-11-27
- Amends: 0031
- Related: 0024, 0040

## Context
ADR 0031 made Vitest the test runner. It runs the domain, the database and, since the first screens, the components in jsdom. None of it can run the PDF engine (WebAssembly, workers, canvas) or prove that the screens, the API, the worker, the storage and the mail work together: the sign-up, the upload and the reader were checked by hand in a real browser, and a hand check protects nothing after the pull request. The spike (ADR 0040) also made every upgrade of EmbedPDF a reason to rerun real-browser checks.

## Decision
1. **Playwright Test** (`@playwright/test`, Apache-2.0) is the runner for browser tests, in `apps/e2e`, run by `pnpm e2e`. Vitest stays the runner of everything else; the two never share files (`*.spec.ts` against `*.test.ts`).
2. **What it drives.** A production build of the web app, the worker, Postgres, the S3-compatible storage and Mailpit, as a person would: sign-up with the email confirmation read from Mailpit, subjects, the import of PDFs, the reader. It owns no business rule: it checks the flows the specs describe.
3. **Isolation.** Every test makes its own confirmed account and gives its page a client address of its own, since the authentication routes are rate limited per address. Nothing is truncated.
4. **CI.** A job `End-to-end tests`, in parallel with the others, with Postgres and Mailpit as services, the storage as in the integration job, and Chromium installed by Playwright. It keeps the report and the traces of a failed run for seven days. It must be a required check of the ruleset (ADR 0031).
5. **Not a replacement.** A rule is still tested where it lives (domain, database, component); a browser test is for what only a browser can show: the integration of the pieces and the real engine.

## Considered options
- **Vitest browser mode.** One runner, but it cannot start the whole stack and the PDF engine in the same way a person reaches it.
- **Cypress.** Equivalent for this use; Playwright runs against the browser engines directly, starts servers itself and keeps traces, with no extra service.
- **Hand checks.** What we had; they find defects once and protect nothing.

## Consequences
The CI gets a few minutes longer. A change that breaks a flow, or an upgrade of the PDF engine that breaks the reader, now fails a pull request. The tests depend on the Portuguese texts of the screens (`messages/pt-BR.json`), so a changed message changes a test.
