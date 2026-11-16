import { DomainError, restoreByRoot, type SyncChange, type TrashParticipant } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { findSubject } from "./repository";
import { documents, subjects } from "./schema";

const upserts = (entity: "subject" | "document", ids: string[]): SyncChange[] =>
  ids.map((entityId) => ({ entity, entityId, op: "upsert" }));

export const subjectTrashParticipant: TrashParticipant = {
  entity: "subject",

  async list(tx, ownerId) {
    const rows = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.ownerId, ownerId), eq(subjects.deletedRootId, subjects.id)));
    return rows.map((row) => ({
      entity: "subject" as const,
      id: row.id,
      label: row.name,
      deletedAt: row.deletedAt!,
    }));
  },

  async restore(tx, ownerId, rootId, now) {
    return upserts("subject", await restoreByRoot(tx, subjects, { ownerId, rootId, now }));
  },
};

export const documentTrashParticipant: TrashParticipant = {
  entity: "document",

  async list(tx, ownerId) {
    const rows = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.ownerId, ownerId), eq(documents.deletedRootId, documents.id)));
    return rows.map((row) => ({
      entity: "document" as const,
      id: row.id,
      label: row.title,
      deletedAt: row.deletedAt!,
    }));
  },

  async restore(tx, ownerId, rootId, now) {
    const [root] = await tx
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.ownerId, ownerId),
          eq(documents.id, rootId),
          eq(documents.deletedRootId, rootId),
        ),
      );
    if (root) {
      const subject = await findSubject(tx, ownerId, root.subjectId);
      if (!subject || subject.deletedAt) {
        throw new DomainError("PARENT_DELETED", "The subject was deleted", 422);
      }
    }
    return upserts("document", await restoreByRoot(tx, documents, { ownerId, rootId, now }));
  },
};
