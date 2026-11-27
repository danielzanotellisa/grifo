# PDF engine spike (P-003)

Throwaway harness that tested EmbedPDF 3.4.0 against the eight exit criteria of `docs/pending/P-003`. The results and the decision are in `docs/adr/0040-pdf-engine-confirmed.md`. This folder is not part of the pnpm workspace, is not linted or formatted, and its dependencies and fixtures are not committed.

## Run it
Needs Node 24 and a Chromium. `lib.mjs`/`browser.mjs` launch the Playwright Chromium cached in `~/Library/Caches/ms-playwright/chromium-1223` (edit `CHROME` in `browser.mjs` for another path).

```sh
cd spikes/pdf-engine
npm install --legacy-peer-deps
npm run fixtures          # test PDFs generated with Chromium (no copyrighted files); the 37 MB book takes a minute
npm run dev &             # Vite on :5199 serving main.jsx
node checks/01-selection-geometry.mjs
```

Every file in `checks/` is a self-contained script that prints its measurements. `checks/09-next-build-smoke.mjs` needs the Next app in `next-app/` built and started (`npm install --legacy-peer-deps && npm run build && npm run start`, with `public/fixtures` linked to `../fixtures`).

## Which check answers which criterion
| Criterion | Check |
| --- | --- |
| 1 selection yields per-line rects in PDF points and text | `01-selection-geometry`, `01b-mouse-drag` |
| 2 prefix and suffix of 32 characters | `02-quote-context` |
| 3 overlay aligned at 50, 100, 200, 400 % | `03-overlay-alignment-zoom` |
| 4 menu on right-click over a selection and over a highlight | `04-context-menu` |
| 5 300 pages: first page, long tasks while scrolling | `05-performance` (`book-300`, `book-300-images`) |
| 6 annotated export | `06a`, `06b` (browser), `06c` (Node) |
| 7 PDF JavaScript never runs, rendering off the main thread | `07-hostile-pdf` |
| 8 re-anchoring by quote with corrupted rects | `08-reanchor-by-quote`, `08b-hyphens-and-search` |
| Next.js production build | `09-next-build-smoke` |
