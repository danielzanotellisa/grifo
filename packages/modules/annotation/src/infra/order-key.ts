import { liveOnly, type PdfRect, type Tx } from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { highlights } from "./schema";

/** Where a highlight sits in reading order: page, then top to bottom, then left to right. */
export type HighlightOrderKey = { pageIndex: number; top: number; left: number };

export function orderKeyOf(pageIndex: number, rects: PdfRect[]): HighlightOrderKey {
  return {
    pageIndex,
    top: Math.max(...rects.flatMap((r) => [r.y1, r.y2])),
    left: Math.min(...rects.flatMap((r) => [r.x1, r.x2])),
  };
}

/** Negative when `a` comes before `b`. PDF points have the origin at the bottom-left, so a higher top is earlier. */
export function compareHighlightOrder(a: HighlightOrderKey, b: HighlightOrderKey): number {
  return a.pageIndex - b.pageIndex || b.top - a.top || a.left - b.left;
}

/** The order keys of live highlights; the outline module uses it to place a new node. */
export async function loadHighlightOrderKeys(
  tx: Tx,
  ownerId: string,
  ids: string[],
): Promise<Map<string, HighlightOrderKey>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: highlights.id, pageIndex: highlights.pageIndex, rects: highlights.rects })
    .from(highlights)
    .where(and(eq(highlights.ownerId, ownerId), inArray(highlights.id, ids), liveOnly(highlights)));
  return new Map(rows.map((row) => [row.id, orderKeyOf(row.pageIndex, row.rects)]));
}
