# Pending

Known gaps and open decisions. An item here means "do not guess": work that depends on it is blocked until it is closed.

## Format
File `P-NNN-kebab-title.md`:

```
# P-NNN. Title
- Status: open | decided (→ ADR NNNN or spec) | dropped
- Blocks: what cannot be built until this is closed
- Related: ADRs, specs

## Problem
## Options (with trade-offs)
## Recommendation
## How to close
```

Closing an item: record the decision in an ADR or spec, set the status, keep the file for history.

## Index
| ID | Title | Status |
| --- | --- | --- |
| P-001 | Summary PDF rendering engine | decided → 0028 |
| P-002 | Job queue library | decided → 0029 |
| P-003 | PDF engine spike (highlight anchoring) | open |
| P-004 | Flashcard CSV import behavior in Anki and Noji | dropped |
| P-005 | Authentication library and sessions | open |
| P-006 | API contract tooling | open |
| P-007 | Sync edge cases | open |
| P-008 | Backup tooling and local versioning | open |
| P-009 | UI kit, styling and i18n library | open |
| P-010 | Image pinning and production worker build | open |
| P-011 | .apkg generator and import verification | open |
| P-012 | Project name | decided → Grifo |
| P-013 | How a row records direct versus cascaded deletion | decided → 0032 |
