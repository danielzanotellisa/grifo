import type { Tx } from "@app/platform";
import { and, eq } from "drizzle-orm";
import { documents, subjects } from "./schema";

export type SubjectRow = typeof subjects.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;

/** By id, deleted or not: callers decide what a deleted row means. */
export async function findSubject(
  tx: Tx,
  ownerId: string,
  id: string,
): Promise<SubjectRow | undefined> {
  const [row] = await tx
    .select()
    .from(subjects)
    .where(and(eq(subjects.ownerId, ownerId), eq(subjects.id, id)));
  return row;
}

export async function findDocument(
  tx: Tx,
  ownerId: string,
  id: string,
): Promise<DocumentRow | undefined> {
  const [row] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.id, id)));
  return row;
}
