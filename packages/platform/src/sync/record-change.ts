import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { changeLog } from "./schema";

export type SyncEntity =
  "subject" | "document" | "category" | "highlight" | "outlineNode" | "flashcard" | "export";

/**
 * Call inside the same transaction as the write. The NOTIFY is delivered on commit,
 * so listeners are never woken for a rolled-back change.
 */
export async function recordChange(
  tx: Tx,
  change: { ownerId: string; entity: SyncEntity; entityId: string; op: "upsert" | "delete" },
): Promise<void> {
  await tx.insert(changeLog).values(change);
  await tx.execute(sql`select pg_notify('sync', ${change.ownerId})`);
}
