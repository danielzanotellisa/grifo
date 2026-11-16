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
| Auto-create | On highlight creation: appended in page/vertical order among root nodes. | — |
| Indent / outdent | Tab: becomes last child of previous sibling. Shift+Tab: becomes next sibling of its parent. With no previous sibling (indent) or no parent (outdent) nothing changes. | `OUTLINE_NODE_NOT_FOUND` |
| Move (drag) | New parent + position between neighbors. | `OUTLINE_CYCLE`, `OUTLINE_NODE_NOT_FOUND` |
| Add free text | Role + text required. | `OUTLINE_NODE_INVALID` |
| Override text/role | Allowed on highlight nodes; highlight unchanged. | — |
| Delete | Children promoted to the deleted node's parent, taking its place in the same order. Undo available. | `OUTLINE_NODE_NOT_FOUND` |

## Acceptance criteria
- [ ] **AC-1** Given nodes A, B, C at root, when B is indented, then B is A's last child and C stays at root after A.
- [ ] **AC-2** Given a node with children is deleted, then its children take its place in the same order.
- [ ] **AC-3** Given an outline node, then it offers "Create flashcard" if and only if its effective role is `DEFINITION`.
- [ ] **AC-4** Given a node with no previous sibling, when it is indented, or a root node, when it is outdented, then the tree is unchanged.
- [ ] **AC-5** Given A at root with children B and C, and D after A, when B is outdented, then the root order is A, B, D and C stays under A.
- [ ] **AC-6** Given A with child B, when A is moved under B, then the move is rejected with `OUTLINE_CYCLE` and the tree is unchanged.
