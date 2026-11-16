import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { changeLog } from "./schema";

export type SyncEntity =
  "subject" | "document" | "category" | "highlight" | "outlineNode" | "flashcard" | "export";

/**
 * Serializes the synced writes of one owner until commit, so `change_log.seq` grows in commit
 * order for that owner and a stored cursor never skips a later-committed change (ADR 0032).
 * Re-entrant within a transaction; keep transactions that call it short.
 */
export const lockOwner = (tx: Tx, ownerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`);

/**
 * Call inside the same transaction as the write. The NOTIFY is delivered on commit,
 * so listeners are never woken for a rolled-back change.
 */
export async function recordChange(
  tx: Tx,
  change: { ownerId: string; entity: SyncEntity; entityId: string; op: "upsert" | "delete" },
): Promise<void> {
  await lockOwner(tx, change.ownerId);
  await tx.insert(changeLog).values(change);
  await tx.execute(sql`select pg_notify('sync', ${change.ownerId})`);
}
