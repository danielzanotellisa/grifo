# Basic reader — spec

- Status: approved
- Module: apps/web
- ADRs: 0017, 0024, 0040, 0041
- Related: `document`, `document/upload`, `document/screens`, `highlight`

## Definition
Opening a `READY` document and reading it: scroll, page navigation and zoom. Highlights, selection menus and the outline are the next slices (`highlight/reader`). The reader talks to the PDF engine only through a surface interface (`features/reader/reader-surface.ts`), so the page logic is tested with a fake surface and the real EmbedPDF is behind one adapter (ADR 0024).

## Screens
| Path | What it is |
| --- | --- |
| `/documents/{id}` | The reader: a bar with a link back to the subject, the title, the page, the zoom; and the document below. Without a session it redirects to `/login`. |
| `/subjects/{id}` | As before, but the title of a `READY` document is a link to its reader; other documents are not links. |

## Rules
1. The page finds the document in a full pull (title, subject, status). A document that is not there (missing, deleted, another person's) shows "document not found" with a link to `/`. A document that is not `READY` says why and links back to its subject, and the file is not requested: `UPLOADED` and `VALIDATING` "still being prepared", `REJECTED` "was refused", `QUARANTINED` "blocked".
2. For a `READY` document the page asks `GET /api/documents/{id}/file` for the presigned URL and hands the surface a function that fetches the bytes from it. The bytes are read in the browser; the original is never changed (ADR 0005).
3. Until the surface reports it is ready the page shows "loading document"; a failure of the file request (`DOCUMENT_NOT_READY` and `NOT_FOUND` as in rule 1, `UNAUTHENTICATED` goes to `/login`, `RATE_LIMITED`, a network failure) or of the surface (the file cannot be fetched or is not a PDF it can open) shows a message with a link back; it never shows a blank page.
4. The bar shows "Page X of N" from the surface; previous and next are disabled at the ends; a page typed in the page field and confirmed with Enter goes there; a number outside 1 to N, or not a number, is refused with a message and the page does not change.
5. Zoom: zoom out and zoom in buttons, the current zoom as a percentage, and "fit width"; a button is disabled when the surface cannot go further.
6. Keyboard: `+` zooms in, `-` zooms out, `0` fits the width, unless the focus is in a text field; every bar control has an accessible name and a visible focus. The document area is focusable, so Page Up, Page Down, Home, End and the arrows scroll it.
7. The reader registers only the plugins ADR 0040 allows: stage, render, interaction and selection (so the text can be selected and copied). It never registers the actions, form or JavaScript plugins, so a PDF's JavaScript never runs.
8. Every text is a key of `messages/pt-BR.json`.

## Acceptance criteria
- [ ] **AC-1** Given a document that is missing, deleted or of another person, then "document not found" and a link to `/`; given one that is `UPLOADED`, `VALIDATING`, `REJECTED` or `QUARANTINED`, then the message of its status, a link to its subject, and no file request.
- [ ] **AC-2** Given a `READY` document, then the file URL is requested once and the surface gets a source that fetches the bytes from it; given a file request that answers `NOT_FOUND`, `DOCUMENT_NOT_READY`, `RATE_LIMITED` or a network failure, then its message and a link back; given `UNAUTHENTICATED`, then the person goes to `/login`.
- [ ] **AC-3** Given the surface is not ready, then "loading document" is shown; given it reports ready, then the bar shows the page and the zoom; given it reports a failure, then the "could not open" message and a link back are shown.
- [ ] **AC-4** Given a surface with N pages on page X, then the bar says "Page X of N", previous is disabled on page 1 and next on page N, a valid page typed with Enter goes to it, and 0, N+1, a negative number and text are refused with a message without moving.
- [ ] **AC-5** Given a surface, then zoom in, zoom out and fit width call it, the percentage follows its zoom, and the buttons it cannot honour are disabled.
- [ ] **AC-6** Given the keys `+`, `-` and `0` outside a text field, then they zoom in, zoom out and fit the width; inside the page field they type; every bar control has an accessible name.
- [ ] **AC-7** Given the subject page, then the title of a `READY` document links to `/documents/{id}` and the title of any other document does not.

## Open questions
- The real EmbedPDF is checked in a real browser by hand and by the checks of `spikes/pdf-engine`, not in CI: a test that drives a browser through the reader is a slice of its own.
- A Content-Security-Policy without `unsafe-eval` for the reader (ADR 0017 point 3) is not in this slice.
- The page the person was on is not remembered between visits.
