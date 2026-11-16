export type DeckScope =
  { kind: "document"; documentId: string } | { kind: "subject"; subjectId: string };

const clean = (name: string): string => name.replaceAll("::", ":").trim();

/** Anki hierarchical deck name: "Subject" or "Subject::Document". */
export const deckName = (subjectName: string, documentTitle?: string): string =>
  documentTitle === undefined
    ? clean(subjectName)
    : `${clean(subjectName)}::${clean(documentTitle)}`;
