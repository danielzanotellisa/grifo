# Annotated PDF export — spec

- Status: approved
- Module: export (engine, job), annotation and library (public reads), apps/web (button)
- ADRs: 0017, 0020, 0040
- Related: `export`, `export/apkg`, `export/summary-pdf`, `highlight`

## Definition
`ANNOTATED_PDF`: the original PDF of one document with its highlights written as real `/Highlight` annotations, in the color of their category. It reuses the request, status and download of `export/apkg`. The job runs the PDF engine in Node (ADR 0040), adds the annotations and saves in incremental mode, so the original bytes stay as the prefix of the result; the original in storage is never changed.

## Rules
1. Scope is `DOCUMENT` only; a `SUBJECT` request is refused (`VALIDATION_FAILED`). The document must be live and `READY`; otherwise the scope is not found.
2. Every live highlight of the document becomes one `/Highlight` annotation on its page, with one quad per stored rect, in the color of the highlight's category (`#rrggbb`). A highlight whose page does not exist in the file is skipped.
3. Geometry: a stored rect is `{ x1, y1, x2, y2 }` in PDF points with the origin at the bottom-left; the engine takes quads with the origin at the top-left (ADR 0040), so a rect on a page of height `H` becomes the quad with upper corners at `H - y2` and lower corners at `H - y1`.
4. A document whose `riskFlags` show active content (JavaScript, open or additional actions, launch actions, embedded files or XFA) is refused: the export fails at once with the code `EXPORT_ACTIVE_CONTENT` and is not retried, because the engine offers no way to remove that content from the original and an exported file must carry none (ADR 0017). The flags are a lower bound (`document/upload`).
5. The result is stored in the `derived` bucket at `<owner>/exports/<id>.pdf` and downloaded as `<title> (marcado).pdf`.
6. A document with no highlights succeeds with a copy of the original.

## Screens
- The reader bar has "Exportar PDF com marcações" for the document. It behaves like the other export buttons (`export/apkg#AC-8`) and shows "Este PDF tem conteúdo ativo (como scripts) e não pode ser exportado com marcações." for `EXPORT_ACTIVE_CONTENT`.

## Acceptance criteria
- [ ] **AC-1** Given highlights with rects on two pages and two categories, then the result has one `/Highlight` per highlight with the color of its category and quads converted to the top-left origin, and the original bytes are the prefix of the result.
- [ ] **AC-2** Given a highlight on a page the file does not have, then it is skipped and the others are written; given no highlights, then the result equals the original.
- [ ] **AC-3** Given a request for `ANNOTATED_PDF` of a document, then it is accepted as `DOCUMENT`; a `SUBJECT` scope or a scope that is missing, deleted, not ready or of another user is refused.
- [ ] **AC-4** Given the job for a document with highlights, then it stores the annotated PDF in the `derived` bucket, marks the export `SUCCEEDED`, the download name is `<title> (marcado).pdf` and only the owner's live highlights are written.
- [ ] **AC-5** Given a document with active content in its `riskFlags`, then the export is `FAILED` with `EXPORT_ACTIVE_CONTENT` after one run, with no retry.
- [ ] **AC-6** Given the reader, then the export button requests an `ANNOTATED_PDF` of the document, waits and downloads; `EXPORT_ACTIVE_CONTENT` shows its message.
- [ ] **AC-7** Given the real app in a browser, when a passage is marked and "Exportar PDF com marcações" is used, then a `.pdf` file with a `/Highlight` annotation is downloaded.

## Open questions
- Removing active content from the original so those documents can be exported: the engine's API does not allow it today.
- Rotated pages and crop boxes are not taken into account: the quads use the page size and a rotation of 0.
