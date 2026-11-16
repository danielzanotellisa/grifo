# P-004. Flashcard CSV import behavior in Anki and Noji

- Status: dropped (CSV replaced by .apkg, ADR 0027; see P-011)
- Blocks: final format of the Noji CSV; whether .apkg comes back
- Related: ADR 0025, specs `flashcard`, `deck`, `export`

## Questions to verify by hand
1. Anki: importing the same CSV twice with `#guid column` updates notes instead of duplicating (Anki's manual suggests own ids in the first field; confirm the GUID approach behaves well).
2. Anki: the user must pick the "Basic" note type in the dialog (its name is localized, e.g. "Básico") — acceptable UX?
3. Noji: which separator/quoting it expects; whether it accepts a file or only pasted text; whether re-importing duplicates cards.
4. Noji: does a subject-level export need one file per document (no deck column)?

## Options if Noji duplicates on re-import
- Document it ("import once; for updates, delete the deck first").
- Export only new/changed cards since the last export.
- Bring back .apkg for Noji (it imports .apkg).

## How to close
Run the checks, update ADR 0025 consequences or write a new ADR.
