import { OUTLINE_ROLES, ownedColumns, softDeleteCheck } from "@app/platform";
import { sql } from "drizzle-orm";
import { check, index, pgSchema, text, uuid } from "drizzle-orm/pg-core";

export const outline = pgSchema("outline");

// Own enum (no cross-schema types); values mirror the platform kernel.
export const outlineRole = outline.enum("outline_role", OUTLINE_ROLES);

export const nodes = outline.table(
  "nodes",
  {
    ...ownedColumns(),
    documentId: uuid("document_id").notNull(), // library.documents (cross-module: no FK)
    parentId: uuid("parent_id"), // same table; integrity enforced by use cases (soft deletes)
    position: text("position").notNull(),
    highlightId: uuid("highlight_id"), // annotation.highlights (cross-module: no FK)
    role: outlineRole("role"),
    text: text("text"),
  },
  (t) => [
    index("nodes_owner_document_idx").on(t.ownerId, t.documentId),
    softDeleteCheck("nodes", t),
    check(
      "nodes_shape_chk",
      sql`${t.highlightId} is not null or (${t.role} is not null and ${t.text} is not null)`,
    ),
  ],
);
