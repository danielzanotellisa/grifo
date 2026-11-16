import type { Tx } from "@app/platform";
import { liveOnly } from "@app/platform";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { categories, highlights } from "./schema";

export type CategoryRow = typeof categories.$inferSelect;

/** By id, deleted or not: callers decide what a deleted row means. */
export async function findCategory(
  tx: Tx,
  ownerId: string,
  id: string,
): Promise<CategoryRow | undefined> {
  const [row] = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.ownerId, ownerId), eq(categories.id, id)));
  return row;
}

export async function countLiveCategories(tx: Tx, ownerId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(categories)
    .where(and(eq(categories.ownerId, ownerId), liveOnly(categories)));
  return row?.n ?? 0;
}

export async function countLiveHighlights(
  tx: Tx,
  ownerId: string,
  categoryId: string,
): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(highlights)
    .where(
      and(
        eq(highlights.ownerId, ownerId),
        eq(highlights.categoryId, categoryId),
        liveOnly(highlights),
      ),
    );
  return row?.n ?? 0;
}

/** The live category of the owner that already uses this name (case-insensitive), other than `exceptId`. */
export async function nameTakenBy(tx: Tx, ownerId: string, name: string, exceptId: string) {
  const [row] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.ownerId, ownerId),
        liveOnly(categories),
        sql`lower(${categories.name}) = lower(${name})`,
        ne(categories.id, exceptId),
      ),
    );
  return row?.id;
}

export async function shortcutTakenBy(tx: Tx, ownerId: string, shortcut: number, exceptId: string) {
  const [row] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.ownerId, ownerId),
        liveOnly(categories),
        eq(categories.shortcut, shortcut),
        ne(categories.id, exceptId),
      ),
    );
  return row?.id;
}
