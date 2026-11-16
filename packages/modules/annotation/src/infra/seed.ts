import { liveOnly, lockOwner, newId, recordChange, type Tx } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { DEFAULT_CATEGORIES } from "../domain/category";
import { categories } from "./schema";

/**
 * Creates the default categories for an owner who has none, and returns their ids. Called when the
 * account is created; `translate` turns an i18n key into the name stored (plain user data after that).
 */
export async function seedDefaultCategories(
  tx: Tx,
  ownerId: string,
  translate: (key: string) => string,
  now: Date = new Date(),
): Promise<string[]> {
  await lockOwner(tx, ownerId);
  const existing = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.ownerId, ownerId), liveOnly(categories)))
    .limit(1);
  if (existing.length > 0) return [];

  const positions = generateNKeysBetween(null, null, DEFAULT_CATEGORIES.length);
  const ids: string[] = [];
  for (const [i, def] of DEFAULT_CATEGORIES.entries()) {
    const id = newId();
    ids.push(id);
    await tx.insert(categories).values({
      id,
      ownerId,
      name: translate(def.nameKey),
      color: def.color,
      role: def.role,
      shortcut: def.shortcut,
      position: positions[i]!,
      createdAt: now,
      updatedAt: now,
    });
    await recordChange(tx, { ownerId, entity: "category", entityId: id, op: "upsert" });
  }
  return ids;
}
