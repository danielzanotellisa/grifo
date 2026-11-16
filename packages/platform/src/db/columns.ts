import { sql } from "drizzle-orm";
import { check, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

/** Columns every user-owned table has. Call it (don't share builder instances between tables). */
export const ownedColumns = () => ({
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /** The item the user deleted: its own id for a direct delete, the root's id for a cascade (ADR 0032). */
  deletedRootId: uuid("deleted_root_id"),
});

/** A row is deleted if and only if it has a deletion root. Add it to the constraints of every owned table. */
export const softDeleteCheck = (
  tableName: string,
  t: { deletedAt: AnyPgColumn; deletedRootId: AnyPgColumn },
) =>
  check(
    `${tableName}_soft_delete_chk`,
    sql`(${t.deletedAt} is null) = (${t.deletedRootId} is null)`,
  );
