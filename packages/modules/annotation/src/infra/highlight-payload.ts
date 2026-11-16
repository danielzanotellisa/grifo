import { DomainError } from "@app/platform";
import { z } from "zod";
import { normalizeQuoteText } from "../domain/highlight";

const rect = z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }).strict();

const highlightData = z
  .object({
    id: z.uuid(),
    documentId: z.uuid(),
    categoryId: z.uuid(),
    pageIndex: z.number().int().min(0),
    rects: z.array(rect).min(1),
    quote: z
      .object({ exact: z.string(), prefix: z.string().max(32), suffix: z.string().max(32) })
      .strict(),
    note: z.string().nullable(),
  })
  .strict();

const deleteData = z.object({ id: z.uuid() });

export type HighlightData = z.infer<typeof highlightData>;

const invalid = (issues: z.core.$ZodIssue[]) =>
  new DomainError("HIGHLIGHT_INVALID", "The data of the mutation is invalid", 422, {
    issues: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });

/** Validates the data and stores the quote normalized: raw selection text is never kept. */
export function parseHighlightData(data: unknown): HighlightData {
  const parsed = highlightData.safeParse(data);
  if (!parsed.success) throw invalid(parsed.error.issues);

  const exact = normalizeQuoteText(parsed.data.quote.exact);
  if (exact === "") throw new DomainError("HIGHLIGHT_EMPTY", "The quoted text is empty", 422);
  return { ...parsed.data, quote: { ...parsed.data.quote, exact } };
}

export function parseHighlightDelete(data: unknown): { id: string } {
  const parsed = deleteData.safeParse(data);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return parsed.data;
}
