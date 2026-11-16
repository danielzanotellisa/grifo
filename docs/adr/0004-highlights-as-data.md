# 0004. Highlights as data; the original PDF is immutable

- Status: accepted
- Date: 2026-11-15
- Related: 0005, 0013

## Context
The core pain is losing highlights because the PDF was not saved. Writing highlights into the PDF means re-uploading the whole file on every change, risks corruption, and makes highlights hard to query for flashcards and summaries.

## Decision
Imported PDFs are never modified. Each highlight is a row with: document, page index, rects in PDF points (origin bottom-left), a text quote (exact, prefix, suffix — W3C TextQuoteSelector), category, optional note, timestamps and soft delete. An "annotated PDF" is generated on demand by writing real `/Highlight` annotations into a copy.

## Considered options
- Save the modified PDF on each change: cost and corruption risk.
- Geometry only: the quote is what re-anchors a highlight if rendering changes.

## Consequences
Autosave is cheap. Flashcards and summaries become queries. Quote text must be normalized at capture (line-break hyphens, ligatures via NFKC, internal newlines). Annotated PDF export becomes an explicit feature.
