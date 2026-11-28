# Flashcard deck export (.apkg) — spec

- Status: approved
- Module: export (generator, job, routes), apps/web (button)
- ADRs: 0020, 0027
- Related: `export`, `deck`, `flashcard`, `flashcard/screens`

## Definition
The first export kind to be built: `FLASHCARDS_APKG`. The user asks for the deck of one document or of a whole subject, a job builds an Anki package with the frozen note type (ADR 0027), and the browser downloads it. This slice polls the export instead of using SSE (`export#AC-2` stays open for SSE); the other export kinds are not built.

## Operations
| Operation | Input | Rules | Errors (`code`) |
| --- | --- | --- | --- |
| `POST /api/exports` | `{ kind: "FLASHCARDS_APKG", scope: "DOCUMENT" \| "SUBJECT", scopeId }` | Same-origin check. Creates the `Export` row (`QUEUED`) and enqueues `export.render` in one transaction; answers 202 `{ id }`. | `UNAUTHENTICATED` 401, `INVALID_INPUT` 400 (other kind or scope), `NOT_FOUND` 404 (scope missing, deleted or of another user) |
| `GET /api/exports/{id}` | — | `{ id, status, error }`, plus `downloadUrl` (presigned, short-lived, file name `<scope name>.apkg`) once `SUCCEEDED`. | `UNAUTHENTICATED` 401, `NOT_FOUND` 404 (also another user's) |
| `export.render` job | `{ ownerId, exportId }` | Reads in one transaction, builds the package, writes it to the `derived` bucket at a key derived from the export id, marks `SUCCEEDED`. An unexpected failure retries; on the last attempt the export becomes `FAILED` with `{ code: "EXPORT_FAILED" }`. | |

## Package contents
1. One note per live flashcard of the live documents in scope; fields `Front`, `Back`, `Source`; note type `NOTE_TYPE`; GUID `ankiGuid(id)`; modification time = `updatedAt`.
2. Deck per document, named `deckName(subject, document)`; id `stableIntId(name)`.
3. `Source` = `Subject › Document title`, plus `, p. N` when the node comes from a highlight (1-based page).
4. Tags: the subject, the document and `page_<n>` when known; spaces in a tag become `_`.
5. Text is plain in the model and HTML-escaped in the package.
6. A scope with no cards still succeeds, with an empty package.

## Screens
- The cards page has "Exportar para Anki" for the document.
- Each subject page has "Exportar flashcards (Anki)" for the whole subject.
- While waiting the button is disabled and says it is generating; on `SUCCEEDED` the browser downloads the file; on `FAILED` or a failed request the message of the code is shown (`EXPORT_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, network, generic; `UNAUTHENTICATED` → `/login`).

## Acceptance criteria
- [ ] **AC-1** Given a document with cards, then the package has one note per live card with the front, back, GUID and tags above, and the cards of soft-deleted documents or cards are left out.
- [ ] **AC-2** Given a subject with two documents, then the package has one deck per document with the `Subject::Document` names, each with its own cards.
- [ ] **AC-3** Given the same cards exported twice, then the GUIDs, deck ids and note type id are equal, and an edited card keeps its GUID with a newer modification time.
- [ ] **AC-4** Given text with HTML characters, `::` in a name or no cards, then it is escaped, the `::` becomes `:`, and the package is still valid.
- [ ] **AC-5** Given the request route, then it answers 202 with an id, 401 without a session, and 404 for a scope that is missing or another user's.
- [ ] **AC-6** Given the status route, then it answers the state, a download URL once done, and 404 for another user's export.
- [ ] **AC-7** Given the job, then it builds the package from the owner's data only, stores it in the `derived` bucket and marks the export `SUCCEEDED`; on the last failed attempt the export is `FAILED`.
- [ ] **AC-8** Given the cards page and the subject page, then each export button requests the export, waits for it and downloads the file; a failure shows its message.
- [ ] **AC-9** Given the real app in a browser, when the export button of a document with a card is used, then a `.apkg` file is downloaded.

## Open questions
- Verification in Anki desktop, AnkiDroid and Noji, and what the UI says about re-importing: `P-011`, by hand.
