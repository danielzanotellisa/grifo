import { liveOnly, type Tx } from "@app/platform";
import type { DocumentStatus } from "../domain/document";
import { and, eq } from "drizzle-orm";
import { documents } from "./schema";

/** The question other modules ask: does this document exist for this owner and is it not deleted? */
export async function documentIsLive(
  tx: Tx,
  ownerId: string,
  documentId: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.id, documentId), liveOnly(documents)));
  return rows.length === 1;
}

/** Status and page count of a live document of the owner, or null when there is none. */
export async function documentState(
  tx: Tx,
  ownerId: string,
  documentId: string,
): Promise<{ status: DocumentStatus; pageCount: number | null } | null> {
  const [row] = await tx
    .select({ status: documents.status, pageCount: documents.pageCount })
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.id, documentId), liveOnly(documents)));
  return row ?? null;
}
