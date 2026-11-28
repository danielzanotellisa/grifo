# P-003. PDF engine spike (highlight anchoring)

- Status: decided (→ ADR 0040)
- Blocks: reader, highlight creation, annotated PDF export
- Related: ADR 0004, 0024, specs `highlight`, `outline-node`

## Problem
ADR 0024 picks EmbedPDF (PDFium/WASM, headless). It must be proven against real, difficult PDFs before the reader is built on it.

## Test corpus (keep in `spikes/pdf-engine/fixtures`, not committed if copyrighted)
Two-column paper; scanned PDF without text layer; hyphenated Portuguese text; document with formulas; 300+ page book; PDF with `/OpenAction` and JavaScript.

## Exit criteria (all must pass)
1. Selection yields per-line rects in PDF points and the selected text, on every fixture with text.
2. Prefix/suffix (32 chars) can be extracted around a selection.
3. Our own overlay draws stored highlights aligned at 50%, 100%, 200%, 400% zoom.
4. A custom menu opens on right-click over a selection and over an existing highlight.
5. 300-page PDF: first page < 3 s uncached, smooth scroll (no long tasks > 100 ms while scrolling).
6. Annotated export writes `/Highlight` annotations that Acrobat, Chrome and Firefox display.
7. PDF JavaScript never runs; rendering happens off the main thread.
8. Re-anchoring by quote works when rects are deliberately corrupted.

## Also decide here
- `normalizeQuoteText` known issue: compounds hyphenated at a line end ("bem-\nestar") get joined.
- Scanned PDFs: show "no text layer" and offer OCR later, or block highlighting?

## Results (EmbedPDF 3.4.0, 27 Nov 2026; harness in `spikes/pdf-engine`)
Measured on Chromium 148 (headless, Apple Silicon), against a local Vite server, then a Next.js 16 production build. Fixtures were generated with Chromium; no copyrighted file was used.

| # | Criterion | Result |
| --- | --- | --- |
| 1 | Per-line rects in PDF points and the selected text | **Pass.** A programmatic selection and a real mouse drag give one rect per visual line and the text, in reading order, also across the two columns. Rects are in points with the origin at the **top-left** (the port must flip `y`). Hyphenated text, formulas (∑ ∫ √ ² ≥) and 74-line pages work. |
| 2 | Prefix and suffix of 32 characters | **Pass.** `readTextInRange` before and after the character range; prefix + exact + suffix equals the wide read; the page start is handled. |
| 3 | Overlay aligned at 50, 100, 200, 400 % | **Pass.** From stored rects through the engine's page-to-viewport transform, the text ink lies inside the rect at every zoom, with the left edge within 2 px. The rect is the font line box, so it is taller than the ink (13 px at 400 %). |
| 4 | Menu on right-click over a selection and a highlight | **Pass.** The `contextmenu` event reaches the document and the selection survives the right click; our overlay element gets its own event. |
| 5 | 300 pages: first page under 3 s, no long task over 100 ms | **Pass on localhost.** Text book (0.5 MB): first page visible in 0.53 to 0.66 s. Book of images (37 MB): 0.58 to 0.62 s. No long task at all while scrolling to page 75 in 120 wheel steps. PDFium runs in a dedicated worker. **Not measured:** the network time to fetch a large original. |
| 6 | Annotated export | **Pass, with one reader untested.** Native `/Highlight` annotations (three quads, colour) were written in the browser and in Node, and the annotated PDF was reopened by PDFium (the highlight draws) and parsed by pdf.js (Firefox's engine). The original bytes stay as the prefix of the Node export (incremental mode). **Acrobat was not available and was not tested.** |
| 7 | PDF JavaScript never runs; rendering off the main thread | **Pass.** A PDF with an `/OpenAction` and a JavaScript name tree rendered its text with no dialog, no alert and no error; PDFium is in a worker and nothing of it is on the main thread. Holds only while the actions, form and JavaScript-sandbox plugins stay unregistered (ADR 0040). |
| 8 | Re-anchoring by quote with corrupted rects | **Pass.** 240 random selections of 18 to 117 characters on four fixtures: the exact original rects (within 0.5 pt) in 240 of 240, none not found. On the two-column page, where every paragraph repeats up to four times, 54 of 60 needed the stored rect as a tie-breaker (the 32-character context is identical); the other fixtures had one match each. |

Also verified: a Next.js 16 production build (Turbopack) bundles the worker and the WebAssembly as static assets and gives the same results; a scanned page gives an empty selection and an empty text; the packages are Apache-2.0 and MIT.

## Decisions taken here
- `normalizeQuoteText` known issue: the engine itself drops the hyphen of a word hyphenated at a line end ("bem-" + "estar" is read as "bemestar"), so a compound is joined and its hyphen cannot be recovered. It is accepted and documented (ADR 0040). A separate gap, fixed (`highlight#AC-14`): a wrapped soft hyphen comes back as U+00AD inside the word, and `normalizeQuoteText` now removes it.
- Scanned PDFs: the reader says there is no text layer and blocks highlighting; OCR is a later feature.

## Follow-ups
- `highlight/reader` (the reader behavior, AC-1 to AC-3) is still to be written.
- Measure the real fetch time of a large original through a presigned URL.
- Test Acrobat by hand with an exported file.

## How to close
If 1–8 pass: mark ADR 0024 confirmed. If not: new ADR switching to PDF.js (same port, same data).
