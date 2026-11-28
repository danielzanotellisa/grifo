# Summary PDF export — spec

- Status: approved
- Module: export (template, job), outline and annotation (public reads), apps/web (buttons)
- ADRs: 0017, 0020, 0028
- Related: `export`, `export/apkg`, `summary-template`, `outline-node`, `outline-node/screens`

## Definition
`SUMMARY_PDF`: the outline of one document, or of every live document of a subject, as a PDF. It reuses the request, status and download of `export/apkg`; the job fills an HTML template (`classic`, version 1) and Gotenberg renders it (ADR 0028). Only the exports of the user's own data are possible. The annotated PDF and the full-data export stay unbuilt.

## Operations
- `POST /api/exports` accepts `kind: "SUMMARY_PDF"` with scope `DOCUMENT` or `SUBJECT`, like the deck; the row records `templateId` `classic` and `templateVersion` 1.
- `export.render` for this kind reads the outline of each document in scope, builds the HTML, renders it with `GOTENBERG_URL` and stores the PDF at `<owner>/exports/<id>.pdf` in the `derived` bucket. The download is named `<document title or subject name>.pdf`.

## Template `classic` v1
1. The tree is ordered by `position` among siblings (ties by id); a node whose parent is missing counts as a root.
2. The effective role is the node's own, or its highlight's category role; a node with no role or with `IGNORE` is left out.
3. `TOPIC` → heading, level = number of `TOPIC` ancestors + 1, capped at 4 (`h2`…`h4` under the document title `h1`... the document title is `h1`, so levels map to `h2`, `h3`, `h4`, `h4`). `DEFINITION` → a block with a bar in the category color and the page. `ITEM` → a bullet indented by its depth.
4. Highlight nodes show the quote, or their own text when overridden; a source page is shown as `p. N` (1-based) for highlight nodes.
5. A document with no nodes shows "Resumo vazio."; a subject export has one section per live document, by title, each starting a page.
6. Every page has the document title (the subject name for a subject export) and the page number in the footer, through `@page`.
7. Every user text goes through the escaping `html` helper; the document loads nothing from the network and has no script. The text of the template itself (labels) is in Portuguese, as it is part of the file the user gets and not of the UI.

## Screens
- The summary has "Exportar resumo (PDF)" for the document; the subject page has "Exportar resumos (PDF)" for the subject. They behave like the deck buttons (`export/apkg#AC-8`).

## Acceptance criteria
- [ ] **AC-1** Given an outline with roles, depths and an overridden text, then the ordered list has each node with its depth, topic level, role, text, color and page, left out for nodes with no role or `IGNORE`, and with a node whose parent is missing as a root.
- [ ] **AC-2** Given the ordered nodes, then the HTML has the topic headings by level, definition blocks with color and page, bullets by depth, the empty message, and one section per document.
- [ ] **AC-3** Given titles and texts with HTML characters, then they are escaped and nothing else enters the markup.
- [ ] **AC-4** Given a request for `SUMMARY_PDF`, then the export is created with the template id and version; a scope that is missing or another user's answers 404.
- [ ] **AC-5** Given the job for a document or a subject, then the renderer receives the HTML of the owner's live documents only, the PDF is stored in the `derived` bucket and the export is `SUCCEEDED` with a `.pdf` download name; on the last failed attempt it is `FAILED`.
- [ ] **AC-6** Given the summary page and the subject page, then each export button requests a `SUMMARY_PDF` export for its scope, waits and downloads the file.
- [ ] **AC-7** Given the real app in a browser, when "Exportar resumo (PDF)" is used on a document with nodes, then a `.pdf` file is downloaded.

## Open questions
- More templates and their visual design (`summary-template`).
