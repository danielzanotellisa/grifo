# Summary screen (the outline tree) — spec

- Status: approved
- Module: apps/web
- ADRs: 0009, 0041
- Related: `outline-node`, `highlight`, `category`, `highlight/screens`

## Definition
The page that shows and edits the summary of one document: the tree of its outline nodes, built from its highlights, plus free text. Like the other screens it talks straight to the API, with no local database and no offline queue yet. Creating flashcards from definitions is the next slice; dragging with the mouse is not in this one (the keyboard moves nodes).

## Screens
| Path | What it is |
| --- | --- |
| `/documents/{id}/summary` | The summary of a `READY` document: the tree, a form for free text, and the keys below. Without a session it redirects to `/login`; a document that is missing or not `READY` shows a message with a link back. |
| `/documents/{id}` | The reader gets a "Summary" link in its bar. `/subjects/{id}` gets one for every `READY` document. |

## Rules
1. The page pulls everything and builds the tree from the live nodes of this document: children by `position`, depth from `parentId`. A node shows its own `text`, or the quote of its highlight; its role is its own, or the role of the category of its highlight; a highlight node shows the color of its category. A node whose parent is missing is shown at the root.
2. Looks by role: `TOPIC` is a heading, its level the number of `TOPIC` ancestors plus 1; `DEFINITION` carries a "Definition" label; `ITEM` is a bullet. The tree has the roles `tree` and `treeitem`, with `aria-level` and `aria-selected`.
3. Keys, on the tree: Arrow Down and Arrow Up select the next and previous visible node; Tab indents the selected node (it becomes the last child of its previous sibling) and Shift+Tab outdents it (it becomes the next sibling of its parent), nothing happening and nothing being sent when there is no previous sibling or no parent; Alt+Arrow Up and Alt+Arrow Down move it among its siblings; Delete removes it (to the trash, its children taking its place); Enter edits its text and role.
4. A change is the final state of the changed node, sent as one `upsert` of `{ id, documentId, parentId, position, highlightId, role, text }`; a removal is one `delete` of `{ id }`. `position` is a fractional-index key made between the neighbors, never a renumbering. After the server answers the tree is pulled again; nothing is shown as changed before it answers `applied`.
5. Free text: a form with a role (`TOPIC`, `DEFINITION` or `ITEM`) and a text, trimmed and not empty, adds a node after the selected node as its sibling, or at the end of the root level when none is selected, with a new UUIDv7 and no highlight.
6. Editing a highlight node overrides its text and role (an empty text goes back to the quote, "same as the highlight" goes back to the category role); editing a free-text node needs a role and a non-empty text. Escape cancels without sending.
7. A failure is shown by its stable code (`OUTLINE_CYCLE`, `OUTLINE_NODE_INVALID`, `OUTLINE_NODE_NOT_FOUND`, `PARENT_DELETED`, `NOT_FOUND`, `RATE_LIMITED`, a network failure, anything else generic; `UNAUTHENTICATED` goes to `/login`), the tree is pulled again and left as the server has it.
8. Every text is a key of `messages/pt-BR.json`.

## Acceptance criteria
- [ ] **AC-1** Given a pull with nodes of several documents, of several roles, a free-text node, a highlight node with an overridden text and a node whose parent is missing, then the page shows only the live nodes of this document as a tree in position order, with the text, role label, level and color of each as the rules say; given none, an empty message.
- [ ] **AC-2** Given nodes A, B and C at the root, when B is selected and Tab is pressed, then one `upsert` of B goes out with A as its parent and a position after A's last child, and C stays at the root after A; given a node with no previous sibling, then nothing is sent.
- [ ] **AC-3** Given A with children B and C, and D after A, when B is selected and Shift+Tab is pressed, then one `upsert` of B goes out with A's parent and a position between A and D, so the root order is A, B, D; given a root node, then nothing is sent.
- [ ] **AC-4** Given siblings A, B and C, when C is selected and Alt+Arrow Up is pressed, then one `upsert` of C goes out with a position between A and B; Alt+Arrow Down on the last sibling, or Alt+Arrow Up on the first, sends nothing.
- [ ] **AC-5** Given a node with children, when Delete is pressed on it, then one `delete` of its id goes out and, after the pull, its children are shown in its place.
- [ ] **AC-6** Given a role and a text, when the free-text form is sent, then one `upsert` with a new UUIDv7, the document, no highlight, the role and the trimmed text goes out and the node is shown after the selected one (or last at the root); given a blank text, then the error is shown and nothing is sent.
- [ ] **AC-7** Given a highlight node, when its text and role are edited, then one `upsert` goes out with the override and the same `highlightId`; an empty text sends `text: null`; Escape sends nothing; a free-text node without text is refused without sending.
- [ ] **AC-8** Given a rejected result, a problem answer or a network failure, then the message of its code is shown, the tree is pulled again and shown as the server has it; `UNAUTHENTICATED` goes to `/login`.
- [ ] **AC-9** Given the tree operations of the page (indent, outdent, move among siblings, remove), then they behave as the `outline-node` spec says: indenting the second of three siblings makes it the last child of the first; outdenting the first of two children of a node with a next sibling puts it between them; moving a node under its own descendant is refused; removing a node puts its children in its place in the same order.
- [ ] **AC-10** Given the reader and the subject page, then the reader bar has a "Summary" link to `/documents/{id}/summary`, and the title row of each `READY` document on the subject page has one too.
- [ ] **AC-11** Given the real app in a browser, when two passages are marked in the reader, then they are nodes on the summary page; Tab indents the second under the first and it stays after a reload; a free-text node can be added, edited and removed.

## Open questions
- Dragging with the mouse is not here; Alt+Arrow moves among siblings and Tab and Shift+Tab change the level. The choice of a drag-and-drop library stays open in `P-009`.
- The "Create flashcard" action for `DEFINITION` nodes (`outline-node#AC-3`) arrives with the flashcards screens.
- Restoring a node from the trash does not undo the promotion of its children (`outline-node` spec).
