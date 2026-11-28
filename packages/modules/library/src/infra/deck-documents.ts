import { liveOnly, type Tx } from "@app/platform";
import { and, asc, eq } from "drizzle-orm";
import { documents, subjects } from "./schema";

export type DeckScope = { kind: "document" | "subject"; id: string };
export type DeckDocument = {
  documentId: string;
  title: string;
  subjectId: string;
  subjectName: string;
};

/**
 * The live documents a deck covers, by title, with their subject's name. Null when the scope does
 * not exist, belongs to someone else or is deleted (`export/apkg`).
 */
export async function deckDocuments(
  tx: Tx,
  ownerId: string,
  scope: DeckScope,
): Promise<DeckDocument[] | null> {
  const rows = await tx
    .select({
      documentId: documents.id,
      title: documents.title,
      subjectId: subjects.id,
      subjectName: subjects.name,
    })
    .from(documents)
    .innerJoin(subjects, eq(subjects.id, documents.subjectId))
    .where(
      and(
        eq(documents.ownerId, ownerId),
        liveOnly(documents),
        liveOnly(subjects),
        scope.kind === "document" ? eq(documents.id, scope.id) : eq(subjects.id, scope.id),
      ),
    )
    .orderBy(asc(documents.title), asc(documents.id));
  if (rows.length > 0 || scope.kind === "document") return rows.length > 0 ? rows : null;

  const [subject] = await tx
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.ownerId, ownerId), eq(subjects.id, scope.id), liveOnly(subjects)));
  return subject ? [] : null;
}
