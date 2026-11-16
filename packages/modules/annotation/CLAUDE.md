# Module: annotation

Highlights on PDFs and the user's categories. Schema: `annotation`. Specs: `docs/specs/highlight/`, `docs/specs/category/`.

## Owns
- `Highlight` (table `highlights`), `Category` (table `categories`).

## Public API (`src/index.ts`)
- Types, `normalizeQuoteText`, `isHexColor`, `DEFAULT_CATEGORIES`.
- `createCategorySyncHandler()`, `categoryTrashParticipant`, `seedDefaultCategories(tx, ownerId, translate)`. The handler and participant are registered at the composition root together with the highlight handler (next slice); the seed is called when the account is created (needs the auth decision, P-005).
- Exposes "role of a highlight" to the outline module; outline never reads these tables.

## Categories (`docs/specs/category`)
- Sync `data`: `{ id, name, color, role, shortcut, position }` (strict, Zod). Name 1–40 after trim, unique per owner without case among live categories; shortcut 1–9 unique among live categories; both also enforced by partial unique indexes. Deleting a category in use needs `moveHighlightsTo`; the last live category cannot be deleted.
- A deleted category is a trash item; restoring it fails with `CATEGORY_NAME_TAKEN` / `CATEGORY_SHORTCUT_TAKEN` if a live category took them. Highlights moved away are not moved back.
- Not done yet: the effect of a role change or of moving highlights on outline nodes (`highlight` spec AC-5, next slice).

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
