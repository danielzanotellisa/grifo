# Module: outline

The hierarchical summary of a document: a tree of nodes. Schema: `outline`. Spec: `docs/specs/outline-node/`.

## Owns
- `OutlineNode` (table `nodes`).

## Public API (`src/index.ts`)
- Types, `effectiveRole`, `assertValidNode`. The study module asks outline for a node's text and effective role.

## Rules
- The tree is an adjacency list (`parent_id`) ordered by a fractional index (`position`). Insert between siblings by generating a key between their positions; never renumber siblings. Use the `fractional-indexing` package, do not hand-roll it.
- A node is either highlight-based (`highlight_id` set, `role` null = inherits the category role, `text` null = uses the highlight quote) or free text (`highlight_id` null, `role` and `text` required). The DB enforces this with a CHECK.
- Heading level comes from depth among `TOPIC` ancestors, not from a role. There is no "subtopic" role.
- Deleting a node promotes its children to the deleted node's parent, keeping their relative order. Deleting a highlight deletes its node the same way.
- The client loads all nodes of a document at once and builds the tree in memory; do not add recursive endpoints.
- Cycles are invalid: moving a node under its own descendant is rejected (`OUTLINE_CYCLE`).

## Depends on
- `@app/platform`, `@app/annotation` (role and quote of a highlight), `@app/library`.
