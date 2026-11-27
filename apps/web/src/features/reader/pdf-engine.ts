import type { PdfRect } from "@app/platform";

/**
 * Port between the reader UI and the PDF engine (ADR 0024, 0040).
 * The reader and the highlight model only depend on this interface, so the engine
 * (EmbedPDF/PDFium today, PDF.js as fallback) can be swapped without touching stored data.
 * All geometry crossing this boundary is in PDF points, origin bottom-left. EmbedPDF reports page
 * space with the origin at the top-left, so the implementation flips `y` here and nowhere else:
 * `y = pageHeight - (y + height)`.
 */
export interface PdfEngine {
  open(data: ArrayBuffer): Promise<PdfDocumentHandle>;
}

export interface PdfDocumentHandle {
  readonly pageCount: number;
  pageSize(pageIndex: number): { width: number; height: number };
  /** True when the page has no characters (a scan): the reader says so and blocks highlighting. */
  hasTextLayer(pageIndex: number): Promise<boolean>;
  /** Current user selection, with one rect per line segment and the surrounding text for the quote. */
  getSelection(): Promise<EngineSelection | null>;
  /**
   * Re-anchors a highlight from its quote, never from its rects: finds the normalized `exact` on the
   * page, ranks the hits by how well the stored prefix and suffix match around them, and breaks
   * ties by the distance to `hint.rects`. Returns the line rects of the best hit, or null.
   */
  findText(
    quote: { exact: string; prefix: string; suffix: string },
    hint: { pageIndex: number; rects: PdfRect[] },
  ): Promise<{ pageIndex: number; rects: PdfRect[] } | null>;
  close(): Promise<void>;
}

export type EngineSelection = {
  pageIndex: number;
  rects: PdfRect[];
  text: string; // raw; normalize with normalizeQuoteText from @app/annotation
  prefix: string;
  suffix: string;
};
