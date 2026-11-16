# 0024. PDF engine: EmbedPDF (PDFium/WASM) in headless mode, behind a port

- Status: accepted (confirmed or reverted by the spike in P-003)
- Date: 2026-11-15
- Related: 0004, 0017

## Context
The reader needs: fast rendering of long PDFs with virtualization and deep zoom; text selection that yields per-line geometry and text; a custom right-click menu on selections; our own highlight overlay driven by our data; search; writing real annotations for the annotated-PDF export. It must be flexible (we own the UI) and fast.

## Decision
EmbedPDF in headless mode (React adapter): the PDFium engine (Chrome's PDF engine) compiled to WebAssembly, MIT-licensed, with plugins for virtualized scroll, tiled rendering, selection (with a selection-menu slot), search and annotations. The UI uses only the `PdfEngine` port in `apps/web/src/features/reader/pdf-engine.ts`; engine code stays behind it. Our highlights are rendered from our own data, not stored in the engine.

Requirement → capability: rendering/zoom → render + tiling + scroll plugins; selection → selection plugin (`getSelectedText`, selection change events, menu anchored to the selection rect); highlight geometry → PDFium character boxes / highlight segment rects; annotated export → annotation plugin writing native annotations; search → search plugin.

## Considered options
- PDF.js (Apache-2.0): most mature and widely used; native browser selection over a DOM text layer; more to build ourselves; canvas rendering; eval-related CVE history. **Fallback engine**.
- react-pdf-highlighter-extended (on PDF.js): fastest prototype, but its own highlight model and less control.
- Commercial SDKs (Nutrient/PSPDFKit, Apryse): license cost.

## Consequences
Risk: younger project with possible API churn; WASM download of a few MB (cached). Mitigations: the port, an engine-agnostic data model (PDF points + text quote), and the P-003 spike with explicit exit criteria. If the spike fails, a new ADR switches to PDF.js without data migration.
