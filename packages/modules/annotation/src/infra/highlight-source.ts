import { liveOnly, type OutlineRole, type Tx } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { categories, highlights } from "./schema";

/** What other modules need from a live highlight: the role of its category and its quoted text. */
export async function highlightSource(
  tx: Tx,
  ownerId: string,
  highlightId: string,
): Promise<{ role: OutlineRole; quote: string } | null> {
  const [row] = await tx
    .select({ role: categories.role, quote: highlights.quote })
    .from(highlights)
    .innerJoin(categories, eq(categories.id, highlights.categoryId))
    .where(
      and(eq(highlights.ownerId, ownerId), eq(highlights.id, highlightId), liveOnly(highlights)),
    );
  return row ? { role: row.role, quote: row.quote.exact } : null;
}
