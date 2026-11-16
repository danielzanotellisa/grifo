import { DomainError, restoreByRoot, type TrashParticipant } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { findCategory } from "./category-repository";
import type { DocumentStatePort } from "./highlight-sync";
import { highlights } from "./schema";

export function createHighlightTrashParticipant(deps: {
  documentState: DocumentStatePort;
}): TrashParticipant {
  return {
    entity: "highlight",

    async list(tx, ownerId) {
      const rows = await tx
        .select()
        .from(highlights)
        .where(and(eq(highlights.ownerId, ownerId), eq(highlights.deletedRootId, highlights.id)));
      return rows.map((row) => ({
        entity: "highlight" as const,
        id: row.id,
        label: row.quote.exact,
        deletedAt: row.deletedAt!,
      }));
    },

    async restore(tx, ownerId, rootId, now) {
      const [root] = await tx
        .select()
        .from(highlights)
        .where(
          and(
            eq(highlights.ownerId, ownerId),
            eq(highlights.id, rootId),
            eq(highlights.deletedRootId, rootId),
          ),
        );
      if (root) {
        if (!(await deps.documentState(tx, ownerId, root.documentId))) {
          throw new DomainError("PARENT_DELETED", "The document was deleted", 422);
        }
        const category = await findCategory(tx, ownerId, root.categoryId);
        if (!category || category.deletedAt) {
          throw new DomainError("PARENT_DELETED", "The category was deleted", 422);
        }
      }
      const ids = await restoreByRoot(tx, highlights, { ownerId, rootId, now });
      return ids.map((entityId) => ({
        entity: "highlight" as const,
        entityId,
        op: "upsert" as const,
      }));
    },
  };
}
