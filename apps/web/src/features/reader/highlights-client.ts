import { v7 as uuidv7 } from "uuid";
import { pushMutations, type Pulled, type Result } from "../../lib/api";
import type { PdfPageRect, SelectionInfo } from "./reader-surface";

export type Category = {
  id: string;
  name: string;
  color: string;
  role: string;
  shortcut: number | null;
  position: string;
};
export type HighlightItem = {
  id: string;
  documentId: string;
  categoryId: string;
  pageIndex: number;
  rects: PdfPageRect[];
  quote: { exact: string; prefix: string; suffix: string };
  note: string | null;
};

/** The live categories by position and the live highlights of one document in reading order (`highlight/screens`). */
export function extractMarking(
  pulled: Pulled[],
  documentId: string,
): { categories: Category[]; highlights: HighlightItem[] } {
  const live = <T>(entity: string) =>
    pulled.filter((c) => c.entity === entity && c.op === "upsert").map((c) => c.data as T);
  const categories = live<Category>("category").sort((a, b) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );
  const top = (h: HighlightItem) => Math.max(...h.rects.map((r) => r.y2));
  const highlights = live<HighlightItem>("highlight")
    .filter((h) => h.documentId === documentId)
    .sort((a, b) => a.pageIndex - b.pageIndex || top(b) - top(a));
  return { categories, highlights };
}

/** One highlight per page of the selection, all in one push; each gets a UUIDv7 made here (ADR 0006). */
export const createHighlights = (
  documentId: string,
  categoryId: string,
  selection: SelectionInfo,
): Promise<Result<null>> =>
  pushMutations(
    selection.pages.map((page) => ({
      entity: "highlight",
      op: "upsert" as const,
      data: {
        id: uuidv7(),
        documentId,
        categoryId,
        pageIndex: page.pageIndex,
        rects: page.rects,
        quote: { exact: page.exact, prefix: page.prefix, suffix: page.suffix },
        note: null,
      },
    })),
  );

/** Only the category and the note may change after creation: everything else is sent as it is. */
export const changeHighlightCategory = (highlight: HighlightItem, categoryId: string) =>
  pushMutations([{ entity: "highlight", op: "upsert", data: { ...highlight, categoryId } }]);

export const deleteHighlight = (id: string) =>
  pushMutations([{ entity: "highlight", op: "delete", data: { id } }]);
