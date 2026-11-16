import type { PdfRect, Tx } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { highlights } from "./schema";

export type HighlightRow = typeof highlights.$inferSelect;

/** By id, deleted or not: callers decide what a deleted row means. */
export async function findHighlight(
  tx: Tx,
  ownerId: string,
  id: string,
): Promise<HighlightRow | undefined> {
  const [row] = await tx
    .select()
    .from(highlights)
    .where(and(eq(highlights.ownerId, ownerId), eq(highlights.id, id)));
  return row;
}

export const sameRects = (a: PdfRect[], b: PdfRect[]): boolean =>
  a.length === b.length &&
  a.every(
    (r, i) => r.x1 === b[i]!.x1 && r.y1 === b[i]!.y1 && r.x2 === b[i]!.x2 && r.y2 === b[i]!.y2,
  );
