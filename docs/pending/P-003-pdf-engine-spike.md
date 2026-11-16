# P-003. PDF engine spike (highlight anchoring)

- Status: open
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

## How to close
If 1–8 pass: mark ADR 0024 confirmed. If not: new ADR switching to PDF.js (same port, same data).
