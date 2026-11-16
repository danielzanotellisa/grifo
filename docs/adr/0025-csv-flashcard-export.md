# 0025. Flashcard export as CSV first

- Status: superseded by 0027
- Date: 2026-11-15
- Supersedes: 0010

## Context
Both Anki and Noji import CSV. Anki's text importer (2.1.54+) understands file headers, including a GUID column that makes re-imports update existing notes. Noji imports CSV by pasting/uploading into a deck; its duplicate handling is unverified. CSV is simpler to generate and debug than .apkg (a zipped SQLite database).

## Decision
Two CSV flavors:
- **Anki**: tab-separated, quoted fields, headers `#separator:tab`, `#html:true`, `#guid column:1`, `#deck column:2`, `#tags column:5`. GUID = stable value derived from the flashcard id; deck = `Subject::Document`; tags = subject, document, page.
- **Noji**: plain `front,back`, no headers.

.apkg is deferred.

## Considered options
- .apkg only: more control (note type, templates, a "Source" field) and Noji also imports it, but more code and a SQLite-in-JS dependency.
- One generic CSV: loses Anki's update-in-place.

## Consequences
In Anki the user picks the note type in the import dialog (Basic). Anki's manual recommends own ids in the first field rather than the GUID column; we accept the GUID approach and verify it in P-004. Re-importing into Noji may duplicate cards until P-004 is resolved; .apkg returns if it is the only way to get updates in Noji.
