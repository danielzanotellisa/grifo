# Highlight — spec

- Status: draft
- Module: annotation
- ADRs: 0004, 0006, 0024

## Definition
A passage the user marked in a PDF, stored as data (never written into the original).

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| documentId | uuid | Must be a live `READY` document of the owner. |
| categoryId | uuid | Live category of the owner. |
| pageIndex | int | 0-based, < pageCount. |
| rects | `PdfRect[]` | ≥ 1; PDF points, origin bottom-left; one per line segment. |
| quote | `{exact, prefix, suffix}` | `exact` non-empty, normalized with `normalizeQuoteText`; prefix/suffix up to 32 chars. |
| note | text? | Optional. |

## Invariants
1. Geometry and quote are both stored.
2. A highlight whose category role is not `IGNORE` has exactly one outline node, created in the same transaction.
3. MVP: a highlight lives on one page. Selections crossing pages become one highlight per page.

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Create | From a selection + category (click or shortcut 1–9). Written locally first (outbox). | `DOCUMENT_NOT_READY`, `HIGHLIGHT_EMPTY` |
| Change category | Updates role-dependent behavior of its node. | — |
| Add/edit note | | — |
| Delete | Soft delete; its node is deleted (children promoted). Flashcards made from that node are kept. | — |

## Sync
Entity `highlight`.

## Acceptance criteria
- [ ] Given a selection and the shortcut `2`, then a highlight in category #2 appears in < 100 ms and is in IndexedDB before any network call (ADR 0014).
- [ ] Given the browser closes 1 s after a highlight, then it is present on reopen (ADR 0014).
- [ ] Given zoom changes, then the highlight stays aligned with the text.
- [ ] Given "orien-\ntado" is selected, then `quote.exact` contains "orientado".

## Open questions
- Re-anchoring strategy and engine capabilities: `docs/pending/P-003`.
