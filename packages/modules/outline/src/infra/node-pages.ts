import { highlightPages } from "@app/annotation";
import { liveOnly, type Tx } from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { nodes } from "./schema";

/** The 0-based page of the highlight of each live node among these ids; nodes without one are left out. */
export async function nodePages(
  tx: Tx,
  ownerId: string,
  nodeIds: string[],
): Promise<Map<string, number>> {
  if (nodeIds.length === 0) return new Map();
  const rows = await tx
    .select({ id: nodes.id, highlightId: nodes.highlightId })
    .from(nodes)
    .where(and(eq(nodes.ownerId, ownerId), inArray(nodes.id, nodeIds), liveOnly(nodes)));
  const pages = await highlightPages(
    tx,
    ownerId,
    rows.flatMap((row) => (row.highlightId ? [row.highlightId] : [])),
  );
  const byNode = new Map<string, number>();
  for (const row of rows) {
    const page = row.highlightId ? pages.get(row.highlightId) : undefined;
    if (page !== undefined) byNode.set(row.id, page);
  }
  return byNode;
}
