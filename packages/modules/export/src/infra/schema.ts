import { ownedColumns } from "@app/platform";
import { bigint, index, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { EXPORT_KINDS, EXPORT_SCOPES, EXPORT_STATUSES } from "../domain/export";

export const exportSchema = pgSchema("export");

export const exportKind = exportSchema.enum("export_kind", EXPORT_KINDS);
export const exportStatus = exportSchema.enum("export_status", EXPORT_STATUSES);
export const exportScope = exportSchema.enum("export_scope", EXPORT_SCOPES);

export const exports = exportSchema.table("exports", {
  ...ownedColumns(),
  kind: exportKind("kind").notNull(),
  scope: exportScope("scope").notNull(),
  scopeId: uuid("scope_id"),
  status: exportStatus("status").notNull().default("QUEUED"),
  templateId: text("template_id"),
  templateVersion: integer("template_version"),
  snapshotCursor: bigint("snapshot_cursor", { mode: "number" }).notNull(),
  resultKey: text("result_key"),
  error: jsonb("error").$type<{ code: string; message: string }>(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [index("exports_owner_created_idx").on(t.ownerId, t.createdAt)]);
