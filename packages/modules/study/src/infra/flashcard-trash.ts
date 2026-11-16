import { DomainError, restoreByRoot, type Tx, type TrashParticipant } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { flashcards } from "./schema";

export function createFlashcardTrashParticipant(deps: {
  documentIsLive(tx: Tx, ownerId: string, documentId: string): Promise<boolean>;
}): TrashParticipant {
  return {
    entity: "flashcard",

    async list(tx, ownerId) {
      const rows = await tx
        .select()
        .from(flashcards)
        .where(and(eq(flashcards.ownerId, ownerId), eq(flashcards.deletedRootId, flashcards.id)));
      return rows.map((row) => ({
        entity: "flashcard" as const,
        id: row.id,
        label: row.front,
        deletedAt: row.deletedAt!,
      }));
    },

    async restore(tx, ownerId, rootId, now) {
      const [root] = await tx
        .select()
        .from(flashcards)
        .where(
          and(
            eq(flashcards.ownerId, ownerId),
            eq(flashcards.id, rootId),
            eq(flashcards.deletedRootId, rootId),
          ),
        );
      if (root && !(await deps.documentIsLive(tx, ownerId, root.documentId))) {
        throw new DomainError("PARENT_DELETED", "The document was deleted", 422);
      }
      const ids = await restoreByRoot(tx, flashcards, { ownerId, rootId, now });
      return ids.map((entityId) => ({
        entity: "flashcard" as const,
        entityId,
        op: "upsert" as const,
      }));
    },
  };
}
