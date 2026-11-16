# 0012. Permissive dependencies only; no AGPL code

- Status: accepted
- Date: 2026-11-15

## Context
BentoPDF was the main reference studied; it is AGPL-3.0 / commercial. AGPL covers network use: copying its code would force this app to be AGPL.

## Decision
BentoPDF is a reference only. Use the underlying permissive libraries directly (e.g. PDF.js Apache-2.0, pdf-lib MIT, EmbedPDF/PDFium MIT). Every new dependency has its license checked before it is added.

## Consequences
A license checker in CI fails the build on AGPL/GPL dependencies, including libraries loaded at runtime from a CDN.
