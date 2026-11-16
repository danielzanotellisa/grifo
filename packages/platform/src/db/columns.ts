import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Columns every user-owned table has. Call it (don't share builder instances between tables). */
export const ownedColumns = () => ({
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
