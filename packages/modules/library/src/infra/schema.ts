import { ownedColumns } from "@app/platform";
import {
  bigint,
  char,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { DOCUMENT_STATUSES, type RiskFlags } from "../domain/document";

export const library = pgSchema("library");

export const documentStatus = library.enum("document_status", DOCUMENT_STATUSES);

export const subjects = library.table(
  "subjects",
  {
    ...ownedColumns(),
    name: text("name").notNull(),
  },
  (t) => [index("subjects_owner_idx").on(t.ownerId)],
);

export const storedFiles = library.table(
  "stored_files",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stored_files_owner_sha_uq").on(t.ownerId, t.sha256)],
);

export const documents = library.table(
  "documents",
  {
    ...ownedColumns(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    storedFileId: uuid("stored_file_id")
      .notNull()
      .references(() => storedFiles.id),
    title: text("title").notNull(),
    status: documentStatus("status").notNull().default("UPLOADED"),
    pageCount: integer("page_count"),
    riskFlags: jsonb("risk_flags").$type<RiskFlags>().notNull().default({}),
  },
  (t) => [index("documents_owner_subject_idx").on(t.ownerId, t.subjectId)],
);
