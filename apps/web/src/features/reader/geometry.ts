import type { PdfPageRect } from "./reader-surface";

/** A box in the page space of the engine: PDF points with the origin at the top-left. */
export type TopLeftBox = { x: number; y: number; width: number; height: number };

/** The engine's box to the stored rect: PDF points, origin bottom-left (ADR 0040). */
export const toPdfRect = (box: TopLeftBox, pageHeight: number): PdfPageRect => ({
  x1: box.x,
  y1: pageHeight - (box.y + box.height),
  x2: box.x + box.width,
  y2: pageHeight - box.y,
});

/** The stored rect back to the engine's page space, to draw it. */
export const toTopLeftBox = (rect: PdfPageRect, pageHeight: number): TopLeftBox => ({
  x: rect.x1,
  y: pageHeight - rect.y2,
  width: rect.x2 - rect.x1,
  height: rect.y2 - rect.y1,
});
