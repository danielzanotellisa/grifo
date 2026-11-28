import { liveOnly, type Tx } from "@app/platform";
import { and, asc, eq } from "drizzle-orm";
import { categories, highlights } from "./schema";

export type HighlightMark = {
  pageIndex: number; // 0-based
  rects: { x1: number; y1: number; x2: number; y2: number }[]; // bottom-left PDF points
  color: string;
};

/** The live highlights of a document with the color of their category, by page (`export/annotated-pdf`). */
export async function highlightMarks(
  tx: Tx,
  ownerId: string,
  documentId: string,
): Promise<HighlightMark[]> {
  return tx
    .select({
      pageIndex: highlights.pageIndex,
      rects: highlights.rects,
      color: categories.color,
    })
    .from(highlights)
    .innerJoin(categories, eq(categories.id, highlights.categoryId))
    .where(
      and(
        eq(highlights.ownerId, ownerId),
        eq(highlights.documentId, documentId),
        liveOnly(highlights),
      ),
    )
    .orderBy(asc(highlights.pageIndex), asc(highlights.createdAt), asc(highlights.id));
}
