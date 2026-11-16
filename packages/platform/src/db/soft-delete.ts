import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Tx } from "./client";

/** A table built with `ownedColumns()`. */
export type SoftDeletable = PgTable & {
  id: PgColumn;
  ownerId: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
  deletedRootId: PgColumn;
};

/** Condition every module read must include: a deleted row is invisible (`_cross-cutting/soft-delete`). */
export const liveOnly = (table: SoftDeletable): SQL => isNull(table.deletedAt);

/**
 * Soft-deletes the live rows matching `where`, under `rootId`. Rows that were already deleted keep
 * their own root. Returns the ids deleted so the caller can record the changes.
 */
export async function softDeleteWhere(
  tx: Tx,
  table: SoftDeletable,
  input: { ownerId: string; where: SQL; rootId: string; now: Date },
): Promise<string[]> {
  const rows = await tx
    .update(table)
    .set({ deletedAt: input.now, deletedRootId: input.rootId, updatedAt: input.now })
    .where(and(eq(table.ownerId, input.ownerId), input.where, liveOnly(table)))
    .returning({ id: table.id });
  return rows.map((row) => row.id as string);
}

/** Soft-deletes one live row. False when it does not exist, is not the owner's, or is already deleted. */
export async function softDelete(
  tx: Tx,
  table: SoftDeletable,
  input: { ownerId: string; id: string; rootId: string; now: Date },
): Promise<boolean> {
  const ids = await softDeleteWhere(tx, table, { ...input, where: eq(table.id, input.id) });
  return ids.length === 1;
}

/** Brings back every row deleted under `rootId`. Returns the ids restored. */
export async function restoreByRoot(
  tx: Tx,
  table: SoftDeletable,
  input: { ownerId: string; rootId: string; now: Date },
): Promise<string[]> {
  const rows = await tx
    .update(table)
    .set({ deletedAt: null, deletedRootId: null, updatedAt: input.now })
    .where(and(eq(table.ownerId, input.ownerId), eq(table.deletedRootId, input.rootId)))
    .returning({ id: table.id });
  return rows.map((row) => row.id as string);
}
