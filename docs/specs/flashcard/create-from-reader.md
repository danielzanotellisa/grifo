# Create a flashcard from the reader — spec

- Status: draft
- Module: study
- ADRs: 0014, 0027

## Definition
The reader flow that turns a `DEFINITION` highlight into a flashcard without leaving the PDF. The card rules live in `flashcard`; this spec covers only the interaction.

## Acceptance criteria
- [ ] **AC-1** Given a `DEFINITION` highlight in the reader, when the user creates a flashcard from it, then it takes at most 3 actions and the user stays in the reader (ADR 0014).

## Open questions
- Needs the reader UI and the PDF engine decision: `docs/pending/P-003`.
