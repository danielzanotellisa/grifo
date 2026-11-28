import { liveOnly, type Tx } from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { highlights } from "./schema";

/** The 0-based page of each live highlight among these ids. */
export async function highlightPages(
  tx: Tx,
  ownerId: string,
  highlightIds: string[],
): Promise<Map<string, number>> {
  if (highlightIds.length === 0) return new Map();
  const rows = await tx
    .select({ id: highlights.id, pageIndex: highlights.pageIndex })
    .from(highlights)
    .where(
      and(
        eq(highlights.ownerId, ownerId),
        inArray(highlights.id, highlightIds),
        liveOnly(highlights),
      ),
    );
  return new Map(rows.map((row) => [row.id, row.pageIndex]));
}
