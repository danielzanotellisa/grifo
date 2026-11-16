import { bigserial, index, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const platform = pgSchema("platform");

/** Append-only, per-user ordered log of changes. `seq` is the sync cursor (ADR 0015). */
export const changeLog = platform.table(
  "change_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    op: text("op", { enum: ["upsert", "delete"] }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("change_log_owner_seq_idx").on(t.ownerId, t.seq)],
);

/** Makes push idempotent: a mutationId is applied at most once. */
export const processedMutations = platform.table("processed_mutations", {
  mutationId: uuid("mutation_id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  outcome: jsonb("outcome").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
