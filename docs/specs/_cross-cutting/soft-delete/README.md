# Soft delete — spec

- Status: draft
- Module: platform
- ADRs: 0013, 0016, 0018

## Definition
Every user-owned row is deleted softly (`deleted_at`). A deleted row is invisible and read-only; it can only be restored from the trash or physically removed by the purge job.

## Invariants
1. A deleted row is invisible: no list, query, lookup by id or count returns it. Reading it by id answers `NOT_FOUND`.
2. A deleted row is read-only: edit, delete again, derive from it, or use it as a parent or target of another write answers `NOT_FOUND`, and nothing changes.
3. Exactly three operations may touch a deleted row: restore, the trash listing, and the purge job.
4. A row deleted directly by the user is a trash item. A row deleted by cascade (its subject, document or node was deleted) is not: it never appears in the trash on its own, cannot be restored on its own (`NOT_FOUND`), and comes back only when the item that cascaded it is restored.
5. The trash lists only trash items still inside the 30-day window (ADR 0018); after the purge job runs they are gone.
6. Sync delivers a deletion as a tombstone (entity and id), never as row content.
7. The rule is enforced where data is read and written, not only in the UI.

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Delete | Marks the row, and its cascade, deleted in one transaction. | `NOT_FOUND` if already deleted |
| Restore | Only a trash item. Restores it and everything deleted with it, in one transaction. | `NOT_FOUND` if not a trash item |
| List trash | Trash items of the owner, newest first. | — |
| Purge | Physical delete of trash items past the window. | — |

## Acceptance criteria
- [ ] **AC-1** Given a deleted row, when it is listed, counted or fetched by id, then it is absent (404 by id).
- [ ] **AC-2** Given a deleted row, when it is edited, deleted again, or chosen as the parent of another row, then 404 `NOT_FOUND` and nothing changes.
- [ ] **AC-3** Given a trash item with cascaded children, when it is restored, then it and its children are live again.
- [ ] **AC-4** Given a row deleted by cascade, when it is restored on its own, then 404 `NOT_FOUND`.
- [ ] **AC-5** Given items deleted directly and by cascade, when the trash is listed, then only the directly deleted ones appear.
- [ ] **AC-6** Given a deletion, when a client pulls changes, then it receives the entity and id without row content.

## Open questions
- How a row records whether it was deleted directly or by cascade, and which item cascaded it: `docs/pending/P-013`.
