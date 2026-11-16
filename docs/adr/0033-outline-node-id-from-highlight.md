# 0033. The outline node of a highlight has an id derived from the highlight id

- Status: accepted
- Date: 2026-11-16
- Related: 0006, 0009, 0015, 0032

## Context
A highlight whose category role is not `IGNORE` has exactly one outline node (`highlight` spec), created in the same transaction. The local-first client (ADR 0006) shows that node at once, with ids it generates, while the server must also guarantee the node exists. The `annotation` module cannot import `outline` (the dependency goes the other way), and in sync the client would otherwise send the highlight and its node as separate mutations that the server cannot tie together.

## Decision
- The node id is `uuidv5(highlightId, OUTLINE_NODE_NAMESPACE)`, computed by one function of the platform kernel (`outlineNodeIdForHighlight`) that client and server share. The namespace is a fixed constant and never changes.
- When a highlight is created, or its category stops being `IGNORE`, the `annotation` module publishes `annotation.highlightPlaced`; the `outline` module reacts in the same transaction and creates the node, or restores it if it was removed because the highlight was ignored. The node is inserted with `ON CONFLICT DO NOTHING`, so a node the client sent first or sends again is not duplicated.
- When a highlight's category becomes `IGNORE`, `annotation` publishes `annotation.highlightIgnored` and the outline soft-deletes the node under the highlight's id as root, the same root a deleted highlight uses. Restoring by that root brings the node back, and the node never shows in the trash on its own.
- The new node is appended to the root level in page and vertical order of the highlights (`outline-node` spec), reading the order keys through a function that `annotation` exports.

## Considered options
- The client sends the node as a second mutation and the server checks consistency afterwards: the server could not tell a missing node from one still in flight.
- A random server-generated node id returned to the client: the client could not create the node offline before the server answers.
- The `annotation` module calling the outline directly: inverts the dependency graph.

## Consequences
Changing the namespace would orphan every existing node, so it is part of the contract. The node of a highlight can be created by two paths (server reaction, client upsert), and both must be idempotent. A node deleted by the user while its highlight stays is not recreated when the highlight is placed again.
