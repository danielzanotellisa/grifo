# OutlineNode — spec

- Status: draft
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
| Indent / outdent | Tab: becomes last child of previous sibling. Shift+Tab: becomes next sibling of its parent. | `OUTLINE_CYCLE` |
| Move (drag) | New parent + position between neighbors. | `OUTLINE_CYCLE` |
| Add free text | Role + text required. | `OUTLINE_NODE_INVALID` |
| Override text/role | Allowed on highlight nodes; highlight unchanged. | — |
| Delete | Children promoted to the deleted node's parent, order kept. Undo available. | — |

## Acceptance criteria
- [ ] **AC-1** Given nodes A, B, C at root, when B is indented, then B is A's last child and C stays at root after A.
- [ ] **AC-2** Given a node with children is deleted, then its children take its place in the same order.
- [ ] **AC-3** Given a DEFINITION node, then the UI offers "Create flashcard"; for other roles it does not.
