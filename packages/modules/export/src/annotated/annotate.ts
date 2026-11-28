import { localEngine } from "@embedpdf/engine";

/** A highlight to write: 0-based page, category color `#rrggbb`, rects in bottom-left PDF points. */
export type Mark = {
  pageIndex: number;
  color: string;
  rects: { x1: number; y1: number; x2: number; y2: number }[];
};

/**
 * The original with its highlights as real `/Highlight` annotations (`export/annotated-pdf`): the
 * engine runs in Node (ADR 0040) and saves incrementally, so the original bytes stay the prefix of
 * the result. With nothing to write the original is returned as it is.
 */
export async function annotatePdf(original: Uint8Array, marks: Mark[]): Promise<Uint8Array> {
  const engine = localEngine();
  const doc = await engine.open({ kind: "bytes", bytes: new Uint8Array(original) });
  try {
    const { pages } = await doc.pages.list();
    let written = 0;
    for (const mark of marks) {
      const page = pages[mark.pageIndex];
      if (!page || mark.rects.length === 0) continue;
      // The engine's space has the origin at the top-left; the stored rects have it at the bottom-left.
      const height = page.size.height;
      await doc.page(page.ref).annotations.create({
        subtype: "highlight",
        color: mark.color,
        quadPoints: mark.rects.map((rect) => ({
          upperLeft: { x: rect.x1, y: height - rect.y2 },
          upperRight: { x: rect.x2, y: height - rect.y2 },
          lowerLeft: { x: rect.x1, y: height - rect.y1 },
          lowerRight: { x: rect.x2, y: height - rect.y1 },
        })),
      });
      written += 1;
    }
    return written === 0 ? original : await doc.download();
  } finally {
    await doc.close?.();
  }
}
