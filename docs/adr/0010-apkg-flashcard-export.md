# 0010. Flashcard export as .apkg with stable GUIDs

- Status: superseded by 0025
- Date: 2026-11-15

## Context
Targets are Anki and Noji; both import .apkg. Re-exporting after edits must not duplicate cards.

## Decision
Export .apkg with a stable GUID per note derived from the flashcard id, decks named `Subject::Document`, tags for subject/document/page, Basic note type with a "Source" field.

## Consequences
Replaced by CSV-first export (0025). The stable-GUID rule carries over.
