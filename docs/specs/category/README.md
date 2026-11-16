# Category — spec

- Status: approved
- Module: annotation
- ADRs: 0008, 0013, 0015, 0032

## Definition
A user-defined kind of highlight: name + color, linked to a fixed `OutlineRole` that drives behavior.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| name | text | 1–40 chars after trim. Unique per owner (case-insensitive) among live categories. |
| color | `#rrggbb` | Required. |
| role | `OutlineRole` | `TOPIC`, `DEFINITION`, `ITEM`, `IGNORE`. |
| shortcut | 1–9? | Unique per owner when set. |
| position | fractional index | Order in the palette. |

## Invariants
1. Behavior depends on `role`, never on `name`.
2. The user always has at least one category.

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Seed defaults | Only for an owner with no live category: Topic, Definition, Example, Important (names from i18n), with the shortcuts of `DEFAULT_CATEGORIES`. Called when the account is created. | — |
| Create / edit | Changing the color touches no highlight: they point to the category. Changing the role changes how the nodes of its highlights behave (`highlight` spec). | `CATEGORY_NAME_INVALID`, `COLOR_INVALID`, `CATEGORY_NAME_TAKEN`, `CATEGORY_SHORTCUT_TAKEN`, `CATEGORY_INVALID`, `NOT_FOUND` |
| Delete | Soft delete under its own root. If live highlights use it, `moveHighlightsTo` (another live category) is required and they are moved in the same transaction. The last live category cannot be deleted. | `CATEGORY_IN_USE`, `CATEGORY_LAST`, `PARENT_DELETED`, `NOT_FOUND` |
| Restore | Only a trash item; rejected while its name or shortcut is taken by a live category. | `CATEGORY_NAME_TAKEN`, `CATEGORY_SHORTCUT_TAKEN`, `NOT_FOUND` |

## Sync
Entity `category`. `data` of an upsert: `{ id, name, color, role, shortcut, position }` (strict). `data` of a delete: `{ id, moveHighlightsTo? }`. `position` is a fractional-index key chosen by the client.

## Acceptance criteria
- [ ] **AC-1** Given a category used by 10 highlights, when its color changes, then no highlight row is touched and a pull delivers the category with the new color.
- [ ] **AC-3** Given an upsert with a valid category, then it is stored with the trimmed name and a pull returns it; a name that is blank or longer than 40 characters answers `CATEGORY_NAME_INVALID`, a color that is not `#rrggbb` answers `COLOR_INVALID`, malformed data answers `CATEGORY_INVALID`, and nothing is stored.
- [ ] **AC-4** Given a live category with a name or shortcut, then another live category cannot take the same name (compared without case) or the same shortcut (`CATEGORY_NAME_TAKEN`, `CATEGORY_SHORTCUT_TAKEN`); a category may keep its own name, and the name or shortcut of a deleted category can be reused.
- [ ] **AC-5** Given a category that no highlight uses, when it is deleted, then it is soft-deleted under its own root and a pull delivers a tombstone; a deleted category or one of another user answers `NOT_FOUND` to upsert and delete.
- [ ] **AC-6** Given a category used by highlights, when it is deleted without `moveHighlightsTo`, then `CATEGORY_IN_USE` and nothing changes; with a live target category the highlights move to it, the category is deleted and a pull delivers the moved highlights; with a deleted, missing or foreign target, `PARENT_DELETED`, and with the category itself as target, `CATEGORY_INVALID`.
- [ ] **AC-7** Given a single live category, when it is deleted, then `CATEGORY_LAST` and nothing changes.
- [ ] **AC-8** Given a deleted category, then the trash lists it with its name and restoring it makes it live again, unless a live category took its name or shortcut meanwhile, which answers `CATEGORY_NAME_TAKEN` or `CATEGORY_SHORTCUT_TAKEN` and restores nothing.
- [ ] **AC-9** Given an owner with no live category, when the defaults are seeded, then four categories exist with translated names, the colors, roles and shortcuts of `DEFAULT_CATEGORIES` and increasing positions, and a pull delivers them; seeding again, or for an owner who already has a live category, creates nothing.

AC-2 (a role change from `ITEM` to `IGNORE` removes the nodes) moved to `highlight` as AC-5; a retired criterion keeps its number.
