import { sql } from "drizzle-orm";
import type { Db, Tx } from "./client";

/**
 * Runs `fn` in a transaction scoped to one user. RLS policies read `app.user_id` (ADR 0016).
 * `set_config(..., true)` is transaction-local, so pooled connections never leak a user id.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
