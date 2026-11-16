# Module: outline

The hierarchical summary of a document: a tree of nodes. Schema: `outline`. Spec: `docs/specs/outline-node/`.

## Owns
- `OutlineNode` (table `nodes`).

## Public API (`src/index.ts`)
- Types, `effectiveRole`, `assertValidNode`. The study module asks outline for a node's text and effective role.
- `createOutlineSyncHandler(deps)`, `createOutlineTrashParticipant(deps)`, `registerOutlineReactions(events)`: the sync handler (entity `outlineNode`), the trash participant and the reactions to `library.documentDeleted` and `annotation.highlightDeleted`. `deps.documentIsLive` is the port to the library module; the composition root provides it.
- Tree operations on a document's flat node list: `siblings`, `indentNode`, `outdentNode`, `moveNode`, `deleteNode`. Pure and immutable: each returns a new array (the same array when nothing changes) and stamps `updatedAt` on changed nodes only. Persisting the result and appending to the change log is the caller's job.

## Rules
- The tree is an adjacency list (`parent_id`) ordered by a fractional index (`position`). Insert between siblings by generating a key between their positions; never renumber siblings. Use the `fractional-indexing` package, do not hand-roll it.
- A node is either highlight-based (`highlight_id` set, `role` null = inherits the category role, `text` null = uses the highlight quote) or free text (`highlight_id` null, `role` and `text` required). The DB enforces this with a CHECK.
- Heading level comes from depth among `TOPIC` ancestors, not from a role. There is no "subtopic" role.
- Deleting a node promotes its children to the deleted node's parent, keeping their relative order. Deleting a highlight deletes its node the same way.
- The client loads all nodes of a document at once and builds the tree in memory; do not add recursive endpoints.
- Cycles are invalid: moving a node under its own descendant is rejected (`OUTLINE_CYCLE`).

## Sync and persistence (`docs/specs/outline-node`)
- The client sends the final node state as `data`, validated with Zod in `infra/payload.ts`. The server does not replay tree operations, except on delete: it reapplies the pure `deleteNode` so children are promoted whoever deletes (client, highlight cascade).
- Upserts check the node invariants, that the document and parent are live and in the same document, and cycles. A deleted node or another user's node answers `NOT_FOUND` (an insert that collides with another user's id is also `NOT_FOUND`: it must not reveal that the id exists).
- `position` is declared with the `"C"` collation (`fractionalIndex`): the database default would sort `Zz` after `a0`. Never `ORDER BY` a fractional-index column under another collation.
- The trash label is the node text, empty for a highlight node: the outline never reads annotation data; the client shows the quote.
- Nodes of highlights (ADR 0033): `annotation.highlightPlaced` creates the node with the derived id (or restores it if it left because the highlight was ignored), at the end of the root level or before the first root node whose highlight reads later (`loadHighlightOrderKeys` from `@app/annotation`); `highlightIgnored` removes it under the highlight's id as root. A node the client sent first, or the user deleted directly, is left alone.
- A node restored through a document or highlight whose parent was deleted on its own goes to the end of the root (`fixOrphans`): a live node never sits under a deleted parent.
- Not done yet: publishing `outline.nodeDeleted` (study will need it to clear `source_node_id`), and restoring a node does not undo the promotion of its children.

## Depends on
- `@app/platform`, `@app/annotation` (role and quote of a highlight), `@app/library`.
