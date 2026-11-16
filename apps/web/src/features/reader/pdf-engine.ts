import type { PdfRect } from "@app/platform";

/**
 * Port between the reader UI and the PDF engine (ADR 0024).
 * The reader and the highlight model only depend on this interface, so the engine
 * (EmbedPDF/PDFium today, PDF.js as fallback) can be swapped without touching stored data.
 * All geometry crossing this boundary is in PDF points, origin bottom-left.
 */
export interface PdfEngine {
  open(data: ArrayBuffer): Promise<PdfDocumentHandle>;
}

export interface PdfDocumentHandle {
  readonly pageCount: number;
  pageSize(pageIndex: number): { width: number; height: number };
  /** Current user selection, with one rect per line segment and the surrounding text for the quote. */
  getSelection(): Promise<EngineSelection | null>;
  /** Text around a position, used to re-anchor a highlight by its quote. */
  findText(exact: string, near?: { pageIndex: number }): Promise<{ pageIndex: number; rects: PdfRect[] }[]>;
  close(): Promise<void>;
}

export type EngineSelection = {
  pageIndex: number;
  rects: PdfRect[];
  text: string; // raw; normalize with normalizeQuoteText from @app/annotation
  prefix: string;
  suffix: string;
};
