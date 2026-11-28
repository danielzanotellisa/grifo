# P-011. .apkg generator and import verification

- Status: open
- Blocks: `FLASHCARDS_APKG` export
- Related: ADR 0027, specs `flashcard`, `deck`, `export`

## Progress
- 2026-11-28: the generator and the export (spec `export/apkg`) are merged-ready; step 1 is done. Steps 2 and 3, the import checks by hand, are still open.

## Work
1. Write the generator (sql.js + fflate) producing `collection.anki2` + `media`, following the layout genanki produces. Unit-test the SQLite contents.
2. Verify by hand with a 3-deck subject export:
   - Anki desktop: imports, decks nested as `Subject::Document`, Source field shown, tags present.
   - Re-import after editing two cards: notes updated in place, review history kept, no duplicates.
   - AnkiDroid: same.
   - Noji: imports; whether re-import updates or duplicates; whether study progress survives.
3. Decide what the UI says about re-importing into Noji based on (2).

## How to close
Generator merged with tests; results of (2) recorded in ADR 0027's consequences or a new ADR.
