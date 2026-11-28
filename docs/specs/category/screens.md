# Category screen — spec

- Status: approved
- Module: apps/web
- ADRs: 0008, 0013, 0041
- Related: `category`, `highlight/screens`

## Definition
Managing the categories of the palette: listing, creating, editing, reordering and deleting them. Like the other screens it talks straight to the API: no local database and no offline queue. The reader and the summary already read the live categories from the same pull; nothing else changes there.

## Screens
| Path | What it is |
| --- | --- |
| `/categories` | The categories of the person, by palette order. Without a session it redirects to `/login`. |

The signed-in frame has a "Categorias" link next to "Lixeira".

## Rules
1. The page is built from a full pull: the live categories by `position`. Each row shows the color, the name, the role ("Tópico", "Definição", "Item", "Ignorar") and the shortcut digit, if any.
2. Create: a form with name, color (a color input), role and shortcut (none, or 1 to 9). It sends one `upsert` `{ id (UUIDv7), name (trimmed), color, role, shortcut, position }` where `position` goes after the last category. A blank name or one over 40 characters is refused before sending.
3. Edit opens a form in place with the same fields; saving sends one `upsert` with the same id, the changed fields and the same `position`. Escape cancels.
4. Reorder: "Mover para cima" and "Mover para baixo" send one `upsert` of the moved category with a `position` between its new neighbors; the first cannot move up and the last cannot move down.
5. Delete sends one `delete` `{ id }` and says it went to the trash. When the server answers `CATEGORY_IN_USE`, the row asks "Mover as marcações para" with the other categories, and confirming sends `delete` `{ id, moveHighlightsTo }`; cancelling changes nothing. `CATEGORY_LAST` says the last category cannot be deleted.
6. Failures are shown by their stable code: `CATEGORY_NAME_INVALID`, `COLOR_INVALID`, `CATEGORY_NAME_TAKEN`, `CATEGORY_SHORTCUT_TAKEN`, `CATEGORY_INVALID`, `CATEGORY_IN_USE`, `CATEGORY_LAST`, `PARENT_DELETED`, `NOT_FOUND`, `RATE_LIMITED`, a network failure, anything else generic; `UNAUTHENTICATED` goes to `/login`. After any answer the list is pulled again.
7. Every text is a key of `messages/pt-BR.json`; every control has an accessible name; a button whose request is pending is disabled.

## Acceptance criteria
- [ ] **AC-1** Given a pull with categories, highlights and other entities, then the page lists only the live categories by position with color, name, role and shortcut; given none, an empty message; and the shell links to `/categories`.
- [ ] **AC-2** Given a valid form, when a category is created, then one `upsert` of a new UUIDv7, the trimmed name, the color, the role, the shortcut or null, and a position after the last goes out and the list shows it; a blank or too long name shows the error and sends nothing.
- [ ] **AC-3** Given a category, when it is edited, then one `upsert` with the same id, the new fields and the same position goes out; Escape cancels without sending.
- [ ] **AC-4** Given three categories, when one is moved, then one `upsert` with a position between its new neighbors goes out and the list shows the new order; the first has no "move up" and the last no "move down".
- [ ] **AC-5** Given a category in use, when it is deleted, then `CATEGORY_IN_USE` opens the choice of another category, confirming sends the `delete` with `moveHighlightsTo`, and the category leaves the list; given one that is not in use, one `delete` goes out and the page says it went to the trash; given the last one, its message.
- [ ] **AC-6** Given a rejected result, a problem answer or a network failure, then the message of its code is shown and the list is as the server has it; `UNAUTHENTICATED` goes to `/login`.
- [ ] **AC-7** Given the real app in a browser, when a category is created with a shortcut, renamed and deleted, then each change shows on the page, and the new category appears in the reader's palette.
