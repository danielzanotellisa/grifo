# 0040. EmbedPDF confirmed as the PDF engine, with the rules the spike found

- Status: accepted
- Date: 2026-11-27
- Amends: 0024
- Related: 0004, 0017, 0020, 0033

## Context
ADR 0024 chose EmbedPDF and left the choice to be confirmed by a spike (`P-003`). The spike ran `@embedpdf/react` and `@embedpdf/engine` 3.4.0 in headless Chromium (Playwright), in Node, and in a Next.js 16 production build, against generated fixtures: a two-column paper, hyphenated Portuguese, formulas, a scanned page, a hostile PDF with JavaScript, a 300-page text book and a 300-page, 37 MB book of images. The harness is in `spikes/pdf-engine` and the measured results are in `docs/pending/P-003`. All eight exit criteria pass, with the limits below. Findings that shape this decision:
- EmbedPDF published a new major version (3.0.0) on 6 November 2026 and four minors since (3.1 to 3.4, the last on 25 November). The previous generation (`@embedpdf/core` 2.x, `plugin-*` 2.x) has a different API. The risk named in ADR 0024 is real.
- Geometry is in PDF points with the origin at the **top-left** of the page, not the bottom-left that ADR 0004 and the `highlight` spec require.
- PDFium's text extraction drops a hyphen at a line end and joins the halves: "bem-" + "estar" becomes "bemestar", "sócio-econômica" becomes "sócioeconômica". A soft hyphen that wraps comes back as U+00AD inside the word. A text search folds the same way, so a quote taken from the engine always finds itself again.
- The text search folds case, diacritics and whitespace and returns the character range and the line segments of each match, which is what re-anchoring needs.
- The same engine runs in Node (a worker), opens the original, adds native `/Highlight` annotations and saves in incremental mode: the original bytes stay as the prefix of the result.
- Everything in the packages is Apache-2.0 or MIT. The only LGPL package in the tree is `sharp-libvips`, which comes from Next (`P-014`).

## Decision
1. **Engine.** EmbedPDF, behind the `PdfEngine` port. Pin `@embedpdf/react` and `@embedpdf/engine` to an exact version, no ranges; upgrade deliberately, with the spike checks as the regression suite. Start from 3.4.0.
2. **No PDF JavaScript.** The reader registers only the stage, render, interaction, selection, annotation and search plugins. It never registers the actions, form or JavaScript-sandbox plugins (`@embedpdf/plugin-actions`, `plugin-form`, `core-js-sandbox`, `core-acrojs`). The hostile fixture, with an `/OpenAction` and a JavaScript name tree, opened with no dialog, no alert and no error.
3. **Coordinates.** The port converts at its boundary and nowhere else: `y_pdf = pageHeightPt - (y + height)`, where `pageHeightPt` is the page height in points. Stored highlights stay in bottom-left PDF points (spec `highlight`). The overlay draws from stored rects through the engine's page-to-viewport transform, never with its own scale.
4. **Quote.** `quote.exact` is what the engine returns, normalized. `normalizeQuoteText` must also remove U+00AD wherever it appears, not only before a line break. A compound hyphenated at a line end loses its hyphen in the engine text ("bemestar"); the user can edit the node text. The limit is documented, not worked around.
5. **Re-anchoring.** From the quote and the page, never from the stored rects: search the normalized `exact` on the page, rank the hits by how much of the stored prefix and suffix match around them, and break ties by the distance to the stored rect. The rects only break ties. When the same text with the same context appears twice and the rects are lost, the first occurrence is taken; content cannot tell them apart.
6. **No text layer.** A page with no characters (a scan) is detected by an empty selection and an empty page text. The reader says so and blocks highlighting on it; OCR is a later feature.
7. **Annotated export.** It runs in the worker with the engine in Node, writes native `/Highlight` annotations from the stored quads, saves in the default incremental mode and uploads the result to the derived bucket. The original is never modified.
8. **The port changes.** `findText` takes the whole quote and an optional hint (page and rects) and returns the rects of the best hit, in bottom-left points.

## Considered options
- **PDF.js as the engine** (the fallback of ADR 0024). Not needed: nothing failed. It remains the fallback behind the port. It is already used in the worker to validate uploads.
- **Pinning to the previous generation (2.x).** Older but stable; it would be abandoned by the project and its docs no longer match.
- **Re-anchoring with our own text index.** The engine's search already provides it, with the same folding as the extraction.

## Consequences
The reader can be built. The port in `apps/web/src/features/reader/pdf-engine.ts` is updated. Each upgrade of EmbedPDF must rerun `spikes/pdf-engine/checks`. The download is about 7.7 MB of WebAssembly (3.1 MB gzipped) and roughly 3 MB of JavaScript (about 1 MB gzipped), cached after the first visit. Not measured: the real network time to fetch a large original, since the spike ran on localhost.
