import {
  DomainError,
  liveOnly,
  notFound,
  softDelete,
  type EventBus,
  type SyncChange,
  type SyncHandler,
  type Tx,
} from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { findCategory } from "./category-repository";
import { parseHighlightData, parseHighlightDelete, type HighlightData } from "./highlight-payload";
import { findHighlight, sameRects, type HighlightRow } from "./highlight-repository";
import { highlights } from "./schema";

/** What the annotation needs from the library; the composition root provides it. */
export type DocumentStatePort = (
  tx: Tx,
  ownerId: string,
  documentId: string,
) => Promise<{ status: string; pageCount: number | null } | null>;

export type HighlightDeps = { events: EventBus; documentState: DocumentStatePort };

const parentDeleted = (what: string) =>
  new DomainError("PARENT_DELETED", `The ${what} was deleted`, 422);
const immutable = () =>
  new DomainError(
    "HIGHLIGHT_INVALID",
    "Only the category and the note of a highlight can change",
    422,
  );

function assertGeometryUnchanged(existing: HighlightRow, data: HighlightData): void {
  if (
    existing.documentId !== data.documentId ||
    existing.pageIndex !== data.pageIndex ||
    !sameRects(existing.rects, data.rects) ||
    existing.quote.exact !== data.quote.exact ||
    existing.quote.prefix !== data.quote.prefix ||
    existing.quote.suffix !== data.quote.suffix
  ) {
    throw immutable();
  }
}

async function create(
  tx: Tx,
  ownerId: string,
  data: HighlightData,
  deps: HighlightDeps,
  now: Date,
) {
  const category = await findCategory(tx, ownerId, data.categoryId);
  if (!category || category.deletedAt) throw parentDeleted("category");

  const document = await deps.documentState(tx, ownerId, data.documentId);
  if (!document) throw parentDeleted("document");
  if (document.status !== "READY") {
    throw new DomainError("DOCUMENT_NOT_READY", "The document is not ready", 422);
  }
  if (document.pageCount !== null && data.pageIndex >= document.pageCount) {
    throw new DomainError("HIGHLIGHT_INVALID", "The page is beyond the end of the document", 422);
  }

  const inserted = await tx
    .insert(highlights)
    .values({ ...data, ownerId, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning({ id: highlights.id });
  if (inserted.length === 0) throw notFound("highlight");

  if (category.role !== "IGNORE") {
    await deps.events.publish(tx, {
      type: "annotation.highlightPlaced",
      ownerId,
      highlightId: data.id,
      documentId: data.documentId,
    });
  }
}

async function edit(
  tx: Tx,
  ownerId: string,
  existing: HighlightRow,
  data: HighlightData,
  deps: HighlightDeps,
  now: Date,
) {
  assertGeometryUnchanged(existing, data);
  const category = await findCategory(tx, ownerId, data.categoryId);
  if (!category || category.deletedAt) throw parentDeleted("category");

  await tx
    .update(highlights)
    .set({ categoryId: data.categoryId, note: data.note, updatedAt: now })
    .where(and(eq(highlights.ownerId, ownerId), eq(highlights.id, data.id)));

  if (existing.categoryId === data.categoryId) return;
  const previous = await findCategory(tx, ownerId, existing.categoryId);
  const wasIgnored = previous?.role === "IGNORE";
  const isIgnored = category.role === "IGNORE";
  if (wasIgnored !== isIgnored) {
    await deps.events.publish(tx, {
      type: isIgnored ? "annotation.highlightIgnored" : "annotation.highlightPlaced",
      ownerId,
      highlightId: data.id,
      documentId: data.documentId,
    });
  }
}

export function createHighlightSyncHandler(deps: HighlightDeps): SyncHandler {
  return {
    entity: "highlight",

    async apply(tx, ownerId, { op, data: raw }): Promise<SyncChange[]> {
      const now = new Date();

      if (op === "delete") {
        const { id } = parseHighlightDelete(raw);
        if (!(await softDelete(tx, highlights, { ownerId, id, rootId: id, now })))
          throw notFound("highlight");
        await deps.events.publish(tx, {
          type: "annotation.highlightDeleted",
          ownerId,
          highlightId: id,
          rootId: id,
        });
        return [{ entity: "highlight", entityId: id, op: "delete" }];
      }

      const data = parseHighlightData(raw);
      const existing = await findHighlight(tx, ownerId, data.id);
      if (existing?.deletedAt) throw notFound("highlight");
      if (existing) await edit(tx, ownerId, existing, data, deps, now);
      else await create(tx, ownerId, data, deps, now);
      return [{ entity: "highlight", entityId: data.id, op: "upsert" }];
    },

    async read(tx, ownerId, ids) {
      if (ids.length === 0) return new Map();
      const rows = await tx
        .select()
        .from(highlights)
        .where(
          and(eq(highlights.ownerId, ownerId), inArray(highlights.id, ids), liveOnly(highlights)),
        );
      return new Map(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            documentId: row.documentId,
            categoryId: row.categoryId,
            pageIndex: row.pageIndex,
            rects: row.rects,
            quote: row.quote,
            note: row.note,
          },
        ]),
      );
    },
  };
}
