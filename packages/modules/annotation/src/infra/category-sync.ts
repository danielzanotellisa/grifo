import {
  DomainError,
  liveOnly,
  notFound,
  softDelete,
  type SyncChange,
  type SyncHandler,
  type Tx,
} from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { parseCategoryData, parseCategoryDelete, type CategoryData } from "./category-payload";
import {
  countLiveCategories,
  countLiveHighlights,
  findCategory,
  nameTakenBy,
  shortcutTakenBy,
} from "./category-repository";
import { categories, highlights } from "./schema";

const conflict = (code: string, message: string) => new DomainError(code, message, 409);

async function assertUnique(tx: Tx, ownerId: string, data: CategoryData): Promise<void> {
  if (await nameTakenBy(tx, ownerId, data.name, data.id)) {
    throw conflict("CATEGORY_NAME_TAKEN", "Another category already has this name");
  }
  if (data.shortcut !== null && (await shortcutTakenBy(tx, ownerId, data.shortcut, data.id))) {
    throw conflict("CATEGORY_SHORTCUT_TAKEN", "Another category already has this shortcut");
  }
}

async function upsert(tx: Tx, ownerId: string, raw: unknown): Promise<SyncChange[]> {
  const data = parseCategoryData(raw);
  const now = new Date();
  const existing = await findCategory(tx, ownerId, data.id);
  if (existing?.deletedAt) throw notFound("category");
  await assertUnique(tx, ownerId, data);

  if (existing) {
    await tx
      .update(categories)
      .set({
        name: data.name,
        color: data.color,
        role: data.role,
        shortcut: data.shortcut,
        position: data.position,
        updatedAt: now,
      })
      .where(and(eq(categories.ownerId, ownerId), eq(categories.id, data.id)));
  } else {
    const inserted = await tx
      .insert(categories)
      .values({ ...data, ownerId, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning({ id: categories.id });
    if (inserted.length === 0) throw notFound("category");
  }
  return [{ entity: "category", entityId: data.id, op: "upsert" }];
}

async function remove(tx: Tx, ownerId: string, raw: unknown): Promise<SyncChange[]> {
  const { id, moveHighlightsTo } = parseCategoryDelete(raw);
  const now = new Date();
  const target = await findCategory(tx, ownerId, id);
  if (!target || target.deletedAt) throw notFound("category");
  if ((await countLiveCategories(tx, ownerId)) <= 1) {
    throw conflict("CATEGORY_LAST", "The last category cannot be deleted");
  }

  const changes: SyncChange[] = [];
  if ((await countLiveHighlights(tx, ownerId, id)) > 0) {
    if (!moveHighlightsTo) throw conflict("CATEGORY_IN_USE", "Highlights use this category");
    if (moveHighlightsTo === id) {
      throw new DomainError(
        "CATEGORY_INVALID",
        "Highlights cannot move to the category being deleted",
        422,
      );
    }
    const destination = await findCategory(tx, ownerId, moveHighlightsTo);
    if (!destination || destination.deletedAt) {
      throw new DomainError("PARENT_DELETED", "The destination category was deleted", 422);
    }
    const moved = await tx
      .update(highlights)
      .set({ categoryId: moveHighlightsTo, updatedAt: now })
      .where(
        and(eq(highlights.ownerId, ownerId), eq(highlights.categoryId, id), liveOnly(highlights)),
      )
      .returning({ id: highlights.id });
    for (const row of moved) changes.push({ entity: "highlight", entityId: row.id, op: "upsert" });
  }

  await softDelete(tx, categories, { ownerId, id, rootId: id, now });
  return [{ entity: "category", entityId: id, op: "delete" }, ...changes];
}

export function createCategorySyncHandler(): SyncHandler {
  return {
    entity: "category",
    apply: (tx, ownerId, { op, data }) =>
      op === "upsert" ? upsert(tx, ownerId, data) : remove(tx, ownerId, data),
    async read(tx, ownerId, ids) {
      if (ids.length === 0) return new Map();
      const rows = await tx
        .select()
        .from(categories)
        .where(
          and(eq(categories.ownerId, ownerId), inArray(categories.id, ids), liveOnly(categories)),
        );
      return new Map(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            name: row.name,
            color: row.color,
            role: row.role,
            shortcut: row.shortcut,
            position: row.position,
          },
        ]),
      );
    },
  };
}
