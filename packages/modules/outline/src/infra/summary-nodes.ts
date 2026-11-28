import { highlightDetails } from "@app/annotation";
import { liveOnly, type Tx } from "@app/platform";
import { and, eq, inArray } from "drizzle-orm";
import { orderSummary, type SummaryNode } from "../domain/summary";
import { nodes } from "./schema";

/** The summary of each of these documents, in reading order; a document with no live node maps to an empty list. */
export async function summaryNodes(
  tx: Tx,
  ownerId: string,
  documentIds: string[],
): Promise<Map<string, SummaryNode[]>> {
  const result = new Map<string, SummaryNode[]>(documentIds.map((id) => [id, []]));
  if (documentIds.length === 0) return result;

  const rows = await tx
    .select()
    .from(nodes)
    .where(
      and(eq(nodes.ownerId, ownerId), inArray(nodes.documentId, documentIds), liveOnly(nodes)),
    );
  const details = await highlightDetails(
    tx,
    ownerId,
    rows.flatMap((row) => (row.highlightId ? [row.highlightId] : [])),
  );
  for (const documentId of documentIds) {
    result.set(
      documentId,
      orderSummary({
        nodes: rows.filter((row) => row.documentId === documentId),
        highlights: details,
      }),
    );
  }
  return result;
}
