import {
  DomainError,
  liveOnly,
  notFound,
  softDelete,
  type EventBus,
  type SyncHandler,
} from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { parseDocumentData, parseIdData } from "./payload";
import { findDocument, findSubject } from "./repository";
import { documents } from "./schema";

/**
 * Documents are created by the upload, not by sync, and `storedFileId`, `status`, `pageCount` and
 * `riskFlags` are stated by the server: a client may only rename, move and delete.
 */
export function createDocumentSyncHandler(deps: { events: EventBus }): SyncHandler {
  return {
    entity: "document",

    async apply(tx, ownerId, { op, data }) {
      const now = new Date();

      if (op === "upsert") {
        const { id, subjectId, title } = parseDocumentData(data);
        const existing = await findDocument(tx, ownerId, id);
        if (!existing || existing.deletedAt) throw notFound("document");
        const subject = await findSubject(tx, ownerId, subjectId);
        if (!subject || subject.deletedAt) {
          throw new DomainError("PARENT_DELETED", "The subject was deleted", 422);
        }
        await tx
          .update(documents)
          .set({ subjectId, title, updatedAt: now })
          .where(and(eq(documents.ownerId, ownerId), eq(documents.id, id)));
        return [{ entity: "document", entityId: id, op: "upsert" }];
      }

      const { id } = parseIdData(data, "DOCUMENT_INVALID");
      if (!(await softDelete(tx, documents, { ownerId, id, rootId: id, now }))) {
        throw notFound("document");
      }
      await deps.events.publish(tx, {
        type: "library.documentDeleted",
        ownerId,
        documentId: id,
        rootId: id,
      });
      return [{ entity: "document", entityId: id, op: "delete" }];
    },

    async read(tx, ownerId, ids) {
      if (ids.length === 0) return new Map();
      const rows = await tx
        .select()
        .from(documents)
        .where(
          and(eq(documents.ownerId, ownerId), inArray(documents.id, ids), liveOnly(documents)),
        );
      return new Map(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            subjectId: row.subjectId,
            storedFileId: row.storedFileId,
            title: row.title,
            status: row.status,
            pageCount: row.pageCount,
            riskFlags: row.riskFlags,
          },
        ]),
      );
    },
  };
}
