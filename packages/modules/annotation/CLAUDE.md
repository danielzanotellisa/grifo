# Module: annotation

Highlights on PDFs and the user's categories. Schema: `annotation`. Specs: `docs/specs/highlight/`, `docs/specs/category/`.

## Owns
- `Highlight` (table `highlights`), `Category` (table `categories`).

## Public API (`src/index.ts`)
- Types, `normalizeQuoteText`, `isHexColor`, `DEFAULT_CATEGORIES`.
- `createAnnotationSyncHandlers({ events, documentState })` (category and highlight handlers), `createCategorySyncHandler`, `createHighlightSyncHandler`, `createHighlightTrashParticipant`, `categoryTrashParticipant`, `registerAnnotationReactions(events)`, `seedDefaultCategories(tx, ownerId, translate)`. All but the seed are registered at the composition root; the seed is called when the account is created (needs the auth decision, P-005).
- `loadHighlightOrderKeys` and `compareHighlightOrder`: reading order of live highlights (page, top to bottom, left to right), used by the outline to place a new node.
- Exposes "role of a highlight" to the outline module; outline never reads these tables.

## Categories (`docs/specs/category`)
- Sync `data`: `{ id, name, color, role, shortcut, position }` (strict, Zod). Name 1–40 after trim, unique per owner without case among live categories; shortcut 1–9 unique among live categories; both also enforced by partial unique indexes. Deleting a category in use needs `moveHighlightsTo`; the last live category cannot be deleted.
- A deleted category is a trash item; restoring it fails with `CATEGORY_NAME_TAKEN` / `CATEGORY_SHORTCUT_TAKEN` if a live category took them. Highlights moved away are not moved back.
- A role change that crosses `IGNORE`, and moving highlights to a category on the other side of `IGNORE`, publish `annotation.highlightIgnored` or `annotation.highlightPlaced` for each highlight.

## Highlights (`docs/specs/highlight`, ADR 0033)
- Sync `data`: `{ id, documentId, categoryId, pageIndex, rects, quote, note }` (strict, Zod). `quote.exact` is stored normalized with `normalizeQuoteText`; prefix and suffix are kept as sent (spaces matter for re-anchoring). After creation only `categoryId` and `note` change.
- Create needs a live `READY` document (`documentState` port, provided by the library) and a live category; the page must be below the page count. Unless the category role is `IGNORE`, it publishes `annotation.highlightPlaced` and the outline creates the node in the same transaction. Delete publishes `annotation.highlightDeleted` with the highlight as root.
- A highlight's node has the id `outlineNodeIdForHighlight(highlightId)`; this module never writes outline data.

## Rules
- A highlight stores geometry (`rects`, PDF points, origin bottom-left) AND a text quote (exact/prefix/suffix). Both are required; the quote is what re-anchors it.
- Quote text is normalized once, at capture, with `normalizeQuoteText` (NFKC, line-break hyphens, internal newlines). Never store raw selection text.
- A highlight points to a `Category`, never to a raw color. Color and name live on the category.
- Category roles are the fixed `OutlineRole` set from the platform kernel. Behavior keys off the role, never off the category name.
- Creating a highlight whose category role is not `IGNORE` must also create its outline node (outline module) in the same transaction.
- Deleting a category in use requires a target category to move its highlights to.
- Highlights of a deleted document are soft-deleted in the same transaction (reacts to library's document-deleted event).

## Depends on
- `@app/platform`, `@app/library` (document existence/readability only).
