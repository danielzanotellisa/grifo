import type { PdfRect, TextQuote } from "@app/platform";

export type Highlight = {
  id: string;
  ownerId: string;
  documentId: string;
  categoryId: string;
  pageIndex: number; // 0-based
  rects: PdfRect[]; // one per line segment, PDF points
  quote: TextQuote;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * Normalizes text captured from a PDF selection (ADR 0004).
 * Known limitation: a real hyphenated compound split at a line end ("bem-\nestar") is joined
 * as "bemestar". Tracked in docs/pending/P-003.
 */
export function normalizeQuoteText(raw: string): string {
  return raw
    .normalize("NFKC") // ligatures such as "ﬁ" become "fi"
    .replace(/(\p{L})[-\u00AD]\s*\n\s*(\p{Ll})/gu, "$1$2") // "orien-\ntado" -> "orientado"
    .replace(/\u00AD/g, "") // a soft hyphen the engine left inside a word (ADR 0040, point 4)
    .replace(/\s*\n\s*/g, " ")
    .replace(/[ \t\u00A0]+/g, " ")
    .trim();
}
