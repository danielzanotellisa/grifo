import {
  DomainError,
  liveOnly,
  notFound,
  softDelete,
  type OutlineRole,
  type SyncHandler,
  type Tx,
} from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import {
  assertCanCreateFlashcard,
  editFlashcard,
  newFlashcard,
  updateFromSource,
} from "../domain/flashcard";
import { parseFlashcardCommand, parseFlashcardDelete } from "./flashcard-payload";
import { findFlashcard, toDomain } from "./flashcard-repository";
import { flashcards } from "./schema";

/** What the study needs from the outline; the composition root provides it (the outline's `nodeSource`). */
export type NodeSourcePort = (
  tx: Tx,
  ownerId: string,
  nodeId: string,
) => Promise<{ documentId: string; text: string; role: OutlineRole } | null>;

export type FlashcardDeps = { nodeSource: NodeSourcePort };

async function liveCard(tx: Tx, ownerId: string, id: string) {
  const row = await findFlashcard(tx, ownerId, id);
  if (!row || row.deletedAt) throw notFound("flashcard");
  return row;
}

export function createFlashcardSyncHandler(deps: FlashcardDeps): SyncHandler {
  return {
    entity: "flashcard",

    async apply(tx, ownerId, { op, data: raw }) {
      const now = new Date();

      if (op === "delete") {
        const { id } = parseFlashcardDelete(raw);
        if (!(await softDelete(tx, flashcards, { ownerId, id, rootId: id, now })))
          throw notFound("flashcard");
        return [{ entity: "flashcard", entityId: id, op: "delete" }];
      }

      const command = parseFlashcardCommand(raw);
      const set = (values: Partial<typeof flashcards.$inferInsert>) =>
        tx
          .update(flashcards)
          .set({ ...values, updatedAt: now })
          .where(and(eq(flashcards.ownerId, ownerId), eq(flashcards.id, command.id)));

      if (command.kind === "create") {
        const existing = await findFlashcard(tx, ownerId, command.id);
        if (existing?.deletedAt) throw notFound("flashcard");
        if (existing)
          throw new DomainError(
            "FLASHCARD_INVALID",
            "A flashcard with this id already exists",
            422,
          );

        const source = await deps.nodeSource(tx, ownerId, command.sourceNodeId);
        if (!source) throw new DomainError("PARENT_DELETED", "The source node was deleted", 422);
        assertCanCreateFlashcard(source.role);
        const card = newFlashcard({
          id: command.id,
          ownerId,
          documentId: source.documentId,
          sourceNodeId: command.sourceNodeId,
          front: command.front,
          nodeText: source.text,
          now,
        });
        const inserted = await tx
          .insert(flashcards)
          .values({
            id: card.id,
            ownerId,
            documentId: card.documentId,
            sourceNodeId: card.sourceNodeId,
            front: card.front,
            back: card.back,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: flashcards.id });
        if (inserted.length === 0) throw notFound("flashcard");
      } else if (command.kind === "edit") {
        const row = await liveCard(tx, ownerId, command.id);
        const edited = editFlashcard(
          toDomain(row),
          { front: command.front, back: command.back },
          now,
        );
        await set({ front: edited.front, back: edited.back });
      } else {
        const row = await liveCard(tx, ownerId, command.id);
        const source = row.sourceNodeId
          ? await deps.nodeSource(tx, ownerId, row.sourceNodeId)
          : null;
        if (!source)
          throw new DomainError("FLASHCARD_SOURCE_GONE", "The source node is not live", 422);
        await set({ back: updateFromSource(toDomain(row), source.text, now).back });
      }
      return [{ entity: "flashcard", entityId: command.id, op: "upsert" }];
    },

    async read(tx, ownerId, ids) {
      if (ids.length === 0) return new Map();
      const rows = await tx
        .select()
        .from(flashcards)
        .where(
          and(eq(flashcards.ownerId, ownerId), inArray(flashcards.id, ids), liveOnly(flashcards)),
        );
      return new Map(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            documentId: row.documentId,
            sourceNodeId: row.sourceNodeId,
            front: row.front,
            back: row.back,
          },
        ]),
      );
    },
  };
}
