import { DomainError, restoreByRoot, type TrashParticipant } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { nameTakenBy, shortcutTakenBy } from "./category-repository";
import { categories } from "./schema";

export const categoryTrashParticipant: TrashParticipant = {
  entity: "category",

  async list(tx, ownerId) {
    const rows = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.ownerId, ownerId), eq(categories.deletedRootId, categories.id)));
    return rows.map((row) => ({
      entity: "category" as const,
      id: row.id,
      label: row.name,
      deletedAt: row.deletedAt!,
    }));
  },

  async restore(tx, ownerId, rootId, now) {
    const [root] = await tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.ownerId, ownerId),
          eq(categories.id, rootId),
          eq(categories.deletedRootId, rootId),
        ),
      );
    if (root) {
      if (await nameTakenBy(tx, ownerId, root.name, root.id)) {
        throw new DomainError("CATEGORY_NAME_TAKEN", "Another category already has this name", 409);
      }
      if (root.shortcut !== null && (await shortcutTakenBy(tx, ownerId, root.shortcut, root.id))) {
        throw new DomainError(
          "CATEGORY_SHORTCUT_TAKEN",
          "Another category already has this shortcut",
          409,
        );
      }
    }
    const ids = await restoreByRoot(tx, categories, { ownerId, rootId, now });
    return ids.map((entityId) => ({
      entity: "category" as const,
      entityId,
      op: "upsert" as const,
    }));
  },
};
