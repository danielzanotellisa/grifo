# Highlights in the reader: marking, listing and removing — spec

- Status: approved
- Module: apps/web
- ADRs: 0004, 0024, 0040, 0041
- Related: `highlight`, `category`, `document/reader`

## Definition
Marking text in the reader with a category, seeing the marks over the page, and listing, recoloring and removing them. Like the other screens it talks straight to the API: no local database and no offline queue yet (`highlight/reader` keeps the speed and the local durability for that slice). Managing the categories themselves, the outline nodes and the flashcards are later slices; the server already creates the node of a highlight (`highlight` spec).

## Rules
1. The reader loads, from the same full pull that finds the document, the live categories (by `position`) and the live highlights of this document, and loads them again after every change.
2. The reader shows the categories as a bar: a color dot, the name and the shortcut digit of each. Selecting text opens a menu next to the selection with the same categories.
3. Choosing a category (a click, or its shortcut digit outside a text field) creates the highlight. A selection that touches several pages makes one highlight per page, sent as one push with one `upsert` per page: a new UUIDv7 `id`, the document, the category, the 0-based `pageIndex`, one rect per line, the quote and `note: null`. The selection is cleared when the push is applied; on a failure it stays.
4. The surface converts geometry at its boundary (ADR 0040): the rects it reports are in PDF points with the origin at the bottom-left, as the server stores them, `{ x1, y1, x2, y2 }`; the engine's top-left space never reaches the page. The quote is the selected text of that page, with the 32 characters before and after it.
5. Each highlight of the document is drawn over its page as translucent rectangles in the color of its category, placed from its stored rects through the page transform of the engine, so it stays aligned at any zoom.
6. A panel beside the page lists the highlights of the document by page and then top to bottom: the color, the quote (cut to 120 characters) and the page. Choosing an item goes to its page. Each item has a category selector (changing it is one `upsert` with the same id, document, page, rects, quote and note, and a new `categoryId`) and a delete button (one `delete`, the highlight goes to the trash and the screen says so).
7. A failure is shown by its stable code: `HIGHLIGHT_EMPTY`, `HIGHLIGHT_INVALID`, `DOCUMENT_NOT_READY`, `PARENT_DELETED` (the category or the document is gone), `NOT_FOUND`, `RATE_LIMITED`, a network failure, anything else generic; `UNAUTHENTICATED` goes to `/login`. A failure leaves the highlights as they were.
8. Escape clears the selection and closes the menu. A digit with no selection, in a text field, with a modifier key, or with no category of that shortcut does nothing.
9. Every text is a key of `messages/pt-BR.json`.

## Acceptance criteria
- [ ] **AC-1** Given a document with highlights and a pull that also carries highlights of other documents, deleted categories and deleted highlights, then the bar shows the live categories by position and the panel lists only the live highlights of this document, by page and then top to bottom, each with its color, quote and page.
- [ ] **AC-2** Given a selection on one page, when a category is chosen in the menu, then one push goes out with one `upsert` carrying a new UUIDv7, the document, the category, the page, the rects, the quote with its prefix and suffix and `note: null`, the list is pulled again and shows the highlight, and the selection is cleared.
- [ ] **AC-3** Given a selection, when the digit of a category is pressed, then that category is used; given no selection, a text field, a modifier key or a digit no category has, then nothing is sent.
- [ ] **AC-4** Given a selection over two pages, then one push goes out with two `upsert`s, each with the rects and the text of its own page.
- [ ] **AC-5** Given the highlights of the document, then the surface is given each one with its page, its rects in bottom-left points and the color of its category, and a highlight whose category changed is given the new color.
- [ ] **AC-6** Given the panel, then choosing an item goes to its page; changing the category sends one `upsert` with everything else unchanged; deleting sends one `delete`, removes the item and says it went to the trash.
- [ ] **AC-7** Given a `rejected` result, a problem answer or a network failure when creating, changing or deleting, then the message of its code is shown, the selection and the highlights are as they were, and `UNAUTHENTICATED` goes to `/login`.
- [ ] **AC-8** Given a rect in the top-left space of the engine and the height of its page, then the surface reports it in bottom-left points, and converting back gives the same rect.
- [ ] **AC-9** Given the real reader in a browser, when text is selected with the mouse and a category is chosen, then the highlight is drawn over the text, is listed in the panel, survives a reload and, once deleted, is gone from both.

## Open questions
- Managing categories (create, rename, recolor, reorder, delete) is the next slice; until then a person has the four defaults.
- A page with no text layer (a scan) gives no selection, so nothing can be marked on it; saying so is a later refinement (ADR 0040).
- Re-anchoring a highlight by its quote when its rects no longer match is not needed yet: the rects are always drawn.
