# P-001. Summary PDF rendering engine

- Status: decided → ADR 0028 (Gotenberg)
- Blocks: `SUMMARY_PDF` export, summary templates
- Related: ADR 0020, spec `summary-template`

## Problem
Turn an outline tree into a well-typeset PDF in the worker, with several templates, fast (300 nodes < 30 s) and without blocking anything.

## Options
| Option | How | Strengths | Weaknesses |
| --- | --- | --- | --- |
| Headless Chromium via **Gotenberg** | Separate container with an HTTP API; send HTML/CSS, get PDF | Full CSS (grid, web fonts, colors); templates are plain HTML and can be prototyped in a browser; worker stays light | Extra ~1 GB container; network hop; limited CSS paged media (running headers need Chromium's header/footer templates) |
| Headless Chromium via **Playwright/Puppeteer in the worker** | Worker launches Chromium | Same fidelity, no extra service | Heavy worker image; browser lifecycle and memory to manage |
| Chromium + **Paged.js** | Polyfill for CSS Paged Media on top of Chromium | Book-like features: running headers, page counters, TOC with page numbers | Extra layer, slower for long documents |
| **@react-pdf/renderer** | React components → PDF in Node, no browser | Light, fast, same language/components; easy to unit test | CSS subset (flexbox only), fonts must be registered, no HTML; rich layouts take more effort |
| **Typst** | Typesetting language, CLI or WASM | Excellent typography, very fast, real paged layout | New template language; HTML prototypes do not carry over |
| pdf-lib / PDFKit by hand | Draw text and boxes | Full control, tiny | You write line breaking, pagination and layout yourself |

## Recommendation
Chromium through **Gotenberg**: templates are HTML/CSS (prototyped as artifacts and reused as-is), best visual fidelity, and the worker only sends HTML. If memory becomes a problem or layouts stay simple, @react-pdf/renderer is the lighter fallback.

## How to close
Prototype 2–3 templates in HTML, render the same 300-node outline with Gotenberg and with @react-pdf/renderer, compare time, memory and look; write the ADR.
