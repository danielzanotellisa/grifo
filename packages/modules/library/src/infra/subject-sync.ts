import {
  liveOnly,
  notFound,
  softDelete,
  softDeleteWhere,
  type EventBus,
  type SyncChange,
  type SyncHandler,
} from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { parseIdData, parseSubjectData } from "./payload";
import { findSubject } from "./repository";
import { documents, subjects } from "./schema";

export function createSubjectSyncHandler(deps: { events: EventBus }): SyncHandler {
  return {
    entity: "subject",

    async apply(tx, ownerId, { op, data }) {
      const now = new Date();

      if (op === "upsert") {
        const { id, name } = parseSubjectData(data);
        const existing = await findSubject(tx, ownerId, id);
        if (existing?.deletedAt) throw notFound("subject");
        if (existing) {
          await tx
            .update(subjects)
            .set({ name, updatedAt: now })
            .where(and(eq(subjects.ownerId, ownerId), eq(subjects.id, id)));
        } else {
          const inserted = await tx
            .insert(subjects)
            .values({ id, ownerId, name, createdAt: now, updatedAt: now })
            .onConflictDoNothing()
            .returning({ id: subjects.id });
          if (inserted.length === 0) throw notFound("subject");
        }
        return [{ entity: "subject", entityId: id, op: "upsert" }];
      }

      const { id } = parseIdData(data, "SUBJECT_INVALID");
      if (!(await softDelete(tx, subjects, { ownerId, id, rootId: id, now }))) {
        throw notFound("subject");
      }
      const documentIds = await softDeleteWhere(tx, documents, {
        ownerId,
        where: eq(documents.subjectId, id),
        rootId: id,
        now,
      });
      for (const documentId of documentIds) {
        await deps.events.publish(tx, {
          type: "library.documentDeleted",
          ownerId,
          documentId,
          rootId: id,
        });
      }
      const changes: SyncChange[] = [{ entity: "subject", entityId: id, op: "delete" }];
      for (const documentId of documentIds) {
        changes.push({ entity: "document", entityId: documentId, op: "delete" });
      }
      return changes;
    },

    async read(tx, ownerId, ids) {
      if (ids.length === 0) return new Map();
      const rows = await tx
        .select()
        .from(subjects)
        .where(and(eq(subjects.ownerId, ownerId), inArray(subjects.id, ids), liveOnly(subjects)));
      return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name }]));
    },
  };
}
