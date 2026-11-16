# OutlineNode — spec

- Status: approved
- Module: outline
- ADRs: 0009, 0013

## Definition
An element of a document's outline tree. Either backed by a highlight or free text written by the user.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| documentId | uuid | |
| parentId | uuid? | Null = root level. Same document. |
| position | fractional index | Order among siblings. |
| highlightId | uuid? | Set for highlight-backed nodes. |
| role | `OutlineRole`? | Null = inherit the highlight's category role. Required for free text. Never `IGNORE`. |
| text | text? | Null = use the highlight quote. Required for free text. |

## Invariants
1. Highlight-backed or free text, as above (DB CHECK).
2. No cycles.
3. Effective role = own role ?? category role.
4. Heading level = number of `TOPIC` ancestors + 1. No "subtopic" role.

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Auto-create | On highlight creation, or when its category stops being `IGNORE`: the node gets the id derived from the highlight id (ADR 0033) and is appended among the root nodes in page and vertical order of the highlights. The server does it in the same transaction; a node the client already sent is not duplicated. | — |
| Indent / outdent | Tab: becomes last child of previous sibling. Shift+Tab: becomes next sibling of its parent. With no previous sibling (indent) or no parent (outdent) nothing changes. | `OUTLINE_NODE_NOT_FOUND` |
| Move (drag) | New parent + position between neighbors. | `OUTLINE_CYCLE`, `OUTLINE_NODE_NOT_FOUND` |
| Add free text | Role + text required. | `OUTLINE_NODE_INVALID` |
| Override text/role | Allowed on highlight nodes; highlight unchanged. | — |
| Delete | Children promoted to the deleted node's parent, taking its place in the same order. Undo available. | `OUTLINE_NODE_NOT_FOUND` |

## Sync
Entity `outlineNode`. The client sends the final state of the node as `data`; the server validates it and does not replay the tree operations of the client.

`data`: `{ id, documentId, parentId, position, highlightId, role, text }`. `id`, `documentId`, `parentId` and `highlightId` are UUIDs (`parentId` and `highlightId` may be null), `position` is a non-empty string, `role` is an `OutlineRole` or null, `text` is a string or null.

Rules:
1. An upsert is validated as the invariants above say, plus: the node cannot change document; its document and its parent node must be live and the parent must belong to the same document; it cannot become its own descendant (`OUTLINE_CYCLE`).
2. A delete promotes the children as in the Delete operation, decided by the server; the client may also send the promotions, which is harmless.
3. Deleting a highlight deletes its node the same way; deleting a document deletes all its nodes (with the document's deletion root).
4. A deleted node, or one that belongs to another user, answers `NOT_FOUND` to upsert and delete (`_cross-cutting/soft-delete`).
5. Restoring a node directly (it is the trash item) puts it back at its old place, and is rejected with `PARENT_DELETED` if its parent node or its document is not live. Restoring through the root of a document or a highlight brings back every node deleted with it, and a node whose parent node is not live is put at the end of the root level instead, so a live node never sits under a deleted parent. Children promoted by the deletion stay where they are. The trash label is the node text, empty for a highlight node.

## Acceptance criteria
- [ ] **AC-1** Given nodes A, B, C at root, when B is indented, then B is A's last child and C stays at root after A.
- [ ] **AC-2** Given a node with children is deleted, then its children take its place in the same order.
- [ ] **AC-3** Given an outline node, then it offers "Create flashcard" if and only if its effective role is `DEFINITION`.
- [ ] **AC-4** Given a node with no previous sibling, when it is indented, or a root node, when it is outdented, then the tree is unchanged.
- [ ] **AC-5** Given A at root with children B and C, and D after A, when B is outdented, then the root order is A, B, D and C stays under A.
- [ ] **AC-6** Given A with child B, when A is moved under B, then the move is rejected with `OUTLINE_CYCLE` and the tree is unchanged.
- [ ] **AC-7** Given a client upserts a valid node, then it is stored and a pull returns the same fields, and upserting the same id again updates that node instead of creating another.
- [ ] **AC-8** Given an upsert whose parent node or document is deleted or missing, then `PARENT_DELETED`; whose parent is in another document, then `OUTLINE_NODE_INVALID`; in both cases nothing is stored.
- [ ] **AC-9** Given an upsert that would place a node under itself or under one of its descendants, then `OUTLINE_CYCLE` and nothing changes.
- [ ] **AC-10** Given a delete of a node with children, then the node is deleted, its children take its place in the same order, and a pull delivers the tombstone and the moved children.
- [ ] **AC-11** Given a highlight is deleted, then its node is deleted and its children are promoted; given a document is deleted, then all its nodes are deleted; a pull delivers the tombstones.
- [ ] **AC-12** Given an upsert or delete for a deleted node or for a node of another user, then `NOT_FOUND` and nothing changes.
- [ ] **AC-13** Given a directly deleted node, then the trash lists it with its text, and restoring it makes it live at its old place; if its parent node or document is not live, then `PARENT_DELETED` and nothing is restored.
- [ ] **AC-14** Given `data` that is malformed, or a free-text node without role or text, or a role `IGNORE`, then `OUTLINE_NODE_INVALID` and nothing is stored.
- [ ] **AC-15** Given a highlight, then its node has the id derived from the highlight id, and a node with that id sent by the client before or after the highlight leaves a single node.
- [ ] **AC-16** Given highlights created on pages 3, 1 and 2 in that order, and on the same page from bottom to top, then their root nodes are ordered by page, then top to bottom, then left to right; nodes without a highlight do not take part in the comparison.
- [ ] **AC-17** Given a node whose parent node was deleted separately, when the node is restored through its document or its highlight, then it is restored at the end of the root level, never as a live node under a deleted parent.
- [ ] **AC-18** Given a highlight whose node was removed because its category became `IGNORE`, when the category stops being `IGNORE`, then the same node is restored; a node the user deleted directly stays deleted.
