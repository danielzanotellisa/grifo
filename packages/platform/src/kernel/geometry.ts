/** Rectangle in PDF user-space points, origin bottom-left (ADR 0004). */
export type PdfRect = { x1: number; y1: number; x2: number; y2: number };

/** W3C Web Annotation TextQuoteSelector: lets a highlight be re-found if geometry drifts. */
export type TextQuote = { exact: string; prefix: string; suffix: string };
