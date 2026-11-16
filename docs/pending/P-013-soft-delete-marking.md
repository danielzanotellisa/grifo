# P-013. How a row records direct versus cascaded deletion

- Status: open
- Blocks: persistence of any entity with children (restore, trash listing), `_cross-cutting/soft-delete` approval
- Related: ADR 0013, ADR 0018, `docs/specs/_cross-cutting/soft-delete`, `docs/specs/subject`, `docs/specs/document`

## Problem
Restore must bring back an item and only what was deleted with it, and the trash must list only items the user deleted directly. A bare `deleted_at` cannot tell a direct delete from a cascade, nor which cascade a row belongs to. A child deleted individually before its parent was deleted must stay deleted when the parent is restored.

## Options (with trade-offs)
- `deleted_root_id uuid` on every owned table: points at the item the user deleted (itself for a direct delete). Trash = rows where `deleted_root_id = id`. Restore = clear rows with that root. Cheap, one extra column.
- `deleted_batch_id uuid` plus a `deletions` table: one row per user action, rows point at it. Richer history (who, when), one more table and join.
- No marker, restore by timestamp equality: fragile, rejected.

## Recommendation
`deleted_root_id`, set in the same transaction as `deleted_at`.

## How to close
Decide in the persistence design, record it in the soft-delete spec (and an ADR if the column becomes part of the platform kernel), then set the status here.
