# Undoing a delete — spec

- Status: approved
- Module: apps/web
- ADRs: 0018, 0043
- Related: `_cross-cutting/soft-delete`, `subject/screens`, `document/screens`, `highlight/screens`, `flashcard/screens`, `category/screens`, `outline-node/screens`

## Definition
Every delete already goes to the trash (`_cross-cutting/soft-delete`) and can be restored from there. The notice that says where the item went also offers to undo it on the spot, with its button or with Ctrl+Z (Cmd+Z), so a slip does not take a trip to the trash. Undoing is a restore of the deleted item by its id (`POST /api/trash/{id}/restore`); nothing new happens on the server.

## Rules
1. After a delete of a subject, a document, a flashcard, a highlight, a category or a summary node, the notice has a button "Desfazer". A summary node deleted with the keyboard also gets a notice now: "Item do resumo enviado para a lixeira."
2. "Desfazer" sends one restore of the id of the deleted item, closes the notice and loads the screen's data again, so the item is back where it was.
3. Ctrl+Z or Cmd+Z does the same while the notice is showing, unless the focus is in a text field that has text, where it keeps its own meaning (an empty field has nothing to undo, and the screens move the focus to one after a delete).
4. A restore that fails shows the message of its code (`PARENT_DELETED`, `NOT_FOUND`, a name or shortcut taken for a category, `RATE_LIMITED`, a network failure, anything else generic; `UNAUTHENTICATED` goes to `/login`) and closes the notice.
5. The notice goes away when another change starts, so "Desfazer" always refers to the last delete.

## Acceptance criteria
- [ ] **AC-1** Given a subject deleted from the list, then its notice offers "Desfazer", which restores it by its id and shows it in the list again.
- [ ] **AC-2** Given a document deleted from the subject page, then its notice offers "Desfazer", which restores it and shows it in the list again.
- [ ] **AC-3** Given a flashcard deleted from the cards page, then its notice offers "Desfazer", which restores it and shows it in the list again.
- [ ] **AC-4** Given a highlight deleted from the reader panel, then its notice offers "Desfazer", which restores it and shows it in the panel again.
- [ ] **AC-5** Given a category deleted from the categories page, then its notice offers "Desfazer", which restores it and shows it in the list again.
- [ ] **AC-6** Given a summary node deleted with the Delete key, then a notice offers "Desfazer", which restores it and shows it in the tree again.
- [ ] **AC-7** Given a notice with "Desfazer", when Ctrl+Z or Cmd+Z is pressed with the focus outside a text field or in an empty one, then the delete is undone; in a field that has text nothing is undone.
- [ ] **AC-8** Given a restore that is rejected or fails, then its message is shown, the notice closes and the list is as the server has it; `UNAUTHENTICATED` goes to `/login`.
- [ ] **AC-9** Given a notice with "Desfazer", when another change starts, then the notice is gone.
