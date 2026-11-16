# Highlight in the reader — spec

- Status: draft
- Module: annotation (client)
- ADRs: 0006, 0014, 0024

## Definition
The reader behavior of a highlight: speed, local durability and alignment. The stored data and the server rules are in `highlight`.

## Acceptance criteria
- [ ] **AC-1** Given a selection and the shortcut `2`, then a highlight in category #2 appears in < 100 ms and is in IndexedDB before any network call (ADR 0014).
- [ ] **AC-2** Given the browser closes 1 s after a highlight, then it is present on reopen (ADR 0014).
- [ ] **AC-3** Given zoom changes, then the highlight stays aligned with the text.

## Open questions
- Needs the reader UI and the PDF engine decision: `docs/pending/P-003`.
