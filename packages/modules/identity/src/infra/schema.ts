import { pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const identity = pgSchema("identity");

export const users = identity.table(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);
