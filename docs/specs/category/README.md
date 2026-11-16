# Category — spec

- Status: draft
- Module: annotation
- ADRs: 0008, 0013

## Definition
A user-defined kind of highlight: name + color, linked to a fixed `OutlineRole` that drives behavior.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| name | text | 1–40 chars. Unique per owner (case-insensitive) among live categories. |
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
| Seed defaults | On first sign-in: Topic, Definition, Example, Important (names from i18n). | — |
| Create / edit | Changing color recolors all its highlights. Changing role changes how its nodes behave (existing flashcards are kept). | `CATEGORY_NAME_TAKEN`, `CATEGORY_SHORTCUT_TAKEN`, `COLOR_INVALID` |
| Delete | If in use, requires `moveHighlightsTo`. Cannot delete the last one. | `CATEGORY_IN_USE`, `CATEGORY_LAST` |

## Acceptance criteria
- [ ] Given a category used by 10 highlights, when its color changes, then all 10 render with the new color without editing them.
- [ ] Given a category's role changes from `ITEM` to `IGNORE`, then its nodes leave the outline and its flashcards remain.
