import { ownedColumns } from "@app/platform";
import { index, pgSchema, text, uuid } from "drizzle-orm/pg-core";

export const study = pgSchema("study");

export const flashcards = study.table(
  "flashcards",
  {
    ...ownedColumns(),
    documentId: uuid("document_id").notNull(), // library.documents (cross-module: no FK)
    sourceNodeId: uuid("source_node_id"), // outline.nodes (cross-module: no FK)
    front: text("front").notNull(),
    back: text("back").notNull(),
  },
  (t) => [index("flashcards_owner_document_idx").on(t.ownerId, t.documentId)],
);
