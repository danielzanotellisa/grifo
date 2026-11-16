# Highlight — spec

- Status: approved
- Module: annotation
- ADRs: 0004, 0006, 0015, 0024, 0032, 0033

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
| Create | From a selection + category (click or shortcut 1–9). Written locally first (outbox). The server stores `quote.exact` normalized and, unless the category role is `IGNORE`, creates the outline node in the same transaction. | `DOCUMENT_NOT_READY`, `HIGHLIGHT_EMPTY`, `HIGHLIGHT_INVALID`, `PARENT_DELETED` |
| Change category | Updates role-dependent behavior of its node: moving between `IGNORE` and another role removes or adds the node. | `PARENT_DELETED`, `NOT_FOUND` |
| Add/edit note | | `NOT_FOUND` |
| Delete | Soft delete under its own root; its node is deleted (children promoted). Flashcards made from that node are kept. | `NOT_FOUND` |
| Restore | Only a trash item; brings its node back. Rejected while its document or category is deleted. | `PARENT_DELETED`, `NOT_FOUND` |

## Sync
Entity `highlight`. `data` of an upsert: `{ id, documentId, categoryId, pageIndex, rects, quote, note }` (strict). After creation only `categoryId` and `note` may change; geometry, quote, page and document are fixed. `data` of a delete: `{ id }`. The outline node of a highlight has the id `outlineNodeIdForHighlight(id)` (ADR 0033).

## Acceptance criteria
- [ ] **AC-4** Given "orien-\ntado" is selected, then `quote.exact` contains "orientado".
- [ ] **AC-5** Given a category's role changes from `ITEM` to `IGNORE`, then the nodes of its highlights leave the outline and their flashcards remain.
- [ ] **AC-6** Given a valid highlight, when it is created, then it is stored with the normalized quote and a pull returns it, and its outline node exists (none if the category role is `IGNORE`).
- [ ] **AC-7** Given a quote that is empty after normalization, then `HIGHLIGHT_EMPTY`; given no rect, a malformed rect, or a prefix or suffix over 32 characters, then `HIGHLIGHT_INVALID`; nothing is stored.
- [ ] **AC-8** Given a document that is deleted or missing, or a category that is deleted or missing, then `PARENT_DELETED`; given a document that is not `READY`, then `DOCUMENT_NOT_READY`; given a page index not below the page count, then `HIGHLIGHT_INVALID`; nothing is stored.
- [ ] **AC-9** Given an existing highlight, then its category and note can change; any other field that differs answers `HIGHLIGHT_INVALID`, and a deleted highlight or one of another user answers `NOT_FOUND`; nothing changes.
- [ ] **AC-10** Given a highlight is deleted, then it is soft-deleted under its own root, its node is deleted with its children promoted, a pull delivers the tombstones, and deleting it again answers `NOT_FOUND`.
- [ ] **AC-11** Given a document is deleted, then its highlights are deleted with the document's root and a pull delivers the tombstones.
- [ ] **AC-12** Given a deleted highlight, then the trash lists it with its quote and restoring it brings back the highlight and its node; restoring while its document or category is deleted answers `PARENT_DELETED` and restores nothing.
- [ ] **AC-13** Given a highlight is moved between categories (by changing its category, or by deleting its category with `moveHighlightsTo`) and the move crosses `IGNORE`, then its node is removed or created accordingly.

AC-1 to AC-3 (reader behavior) moved to `highlight/reader`; a retired criterion keeps its number.

## Open questions
- Re-anchoring strategy and engine capabilities: `docs/pending/P-003`.
