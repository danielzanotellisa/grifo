import {
  OUTLINE_ROLES,
  ownedColumns,
  softDeleteCheck,
  type PdfRect,
  type TextQuote,
} from "@app/platform";
import { char, index, integer, jsonb, pgSchema, smallint, text, uuid } from "drizzle-orm/pg-core";

export const annotation = pgSchema("annotation");

export const outlineRole = annotation.enum("outline_role", OUTLINE_ROLES);

export const categories = annotation.table(
  "categories",
  {
    ...ownedColumns(),
    name: text("name").notNull(),
    color: char("color", { length: 7 }).notNull(),
    role: outlineRole("role").notNull(),
    shortcut: smallint("shortcut"),
    position: text("position").notNull(),
  },
  (t) => [index("categories_owner_idx").on(t.ownerId), softDeleteCheck("categories", t)],
);

export const highlights = annotation.table(
  "highlights",
  {
    ...ownedColumns(),
    documentId: uuid("document_id").notNull(), // library.documents (cross-module: no FK)
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    pageIndex: integer("page_index").notNull(),
    rects: jsonb("rects").$type<PdfRect[]>().notNull(),
    quote: jsonb("quote").$type<TextQuote>().notNull(),
    note: text("note"),
  },
  (t) => [
    index("highlights_owner_document_idx").on(t.ownerId, t.documentId, t.pageIndex),
    softDeleteCheck("highlights", t),
  ],
);
