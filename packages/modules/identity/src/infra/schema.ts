import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const identity = pgSchema("identity");

/**
 * The tables below are read and written by the authentication library through its own pool and role
 * (ADR 0034). Their shape follows what the library expects; the application role has no access.
 */
export const users = identity.table(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    displayName: text("display_name").notNull().default(""),
    image: text("image"), // the library expects it; unused by the app
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = identity.table(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = identity.table(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = identity.table(
  "verifications",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const rateLimits = identity.table("rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/**
 * Verification and reset emails waiting to be sent (ADR 0035). The link carries a token, so the row
 * is readable only by the authentication role; the job that sends it holds just its id.
 */
export const outgoingMail = identity.table(
  "outgoing_mail",
  {
    id: uuid("id").primaryKey(),
    toEmail: text("to_email").notNull(),
    kind: text("kind").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outgoing_mail_created_idx").on(t.createdAt),
    check("outgoing_mail_kind_chk", sql`${t.kind} in ('verification', 'reset')`),
  ],
);
