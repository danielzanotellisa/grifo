import { liveOnly, type OutlineRole, type Tx } from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { categories, highlights } from "./schema";

export type HighlightDetails = {
  quote: string;
  role: OutlineRole;
  color: string;
  pageIndex: number; // 0-based
};

/** What a summary needs from the live highlights among these ids: quote, category role and color, page. */
export async function highlightDetails(
  tx: Tx,
  ownerId: string,
  highlightIds: string[],
): Promise<Map<string, HighlightDetails>> {
  if (highlightIds.length === 0) return new Map();
  const rows = await tx
    .select({
      id: highlights.id,
      quote: highlights.quote,
      role: categories.role,
      color: categories.color,
      pageIndex: highlights.pageIndex,
    })
    .from(highlights)
    .innerJoin(categories, eq(categories.id, highlights.categoryId))
    .where(
      and(
        eq(highlights.ownerId, ownerId),
        inArray(highlights.id, highlightIds),
        liveOnly(highlights),
      ),
    );
  return new Map(
    rows.map((row) => [
      row.id,
      { quote: row.quote.exact, role: row.role, color: row.color, pageIndex: row.pageIndex },
    ]),
  );
}
