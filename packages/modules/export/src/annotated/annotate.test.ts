import { localEngine } from "@embedpdf/engine";
import { describe, expect, it } from "vitest";
import { annotatePdf, type Mark } from "./annotate";

const pdf = (pages: number): Uint8Array => {
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`,
    ...Array.from(
      { length: pages },
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] >>",
    ),
  ];
  return new Uint8Array(
    Buffer.from(
      `%PDF-1.4\n${objects.map((body, i) => `${i + 1} 0 obj\n${body}\nendobj\n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n%%EOF\n`,
      "latin1",
    ),
  );
};

/** What the engine reads back from the annotated file: per page, the highlights with color and quads. */
const readBack = async (bytes: Uint8Array) => {
  const doc = await localEngine().open({ kind: "bytes", bytes });
  const { pages } = await doc.pages.list();
  const out = [];
  for (const page of pages) {
    const { annotations } = await doc.page(page.ref).annotations.list();
    out.push(
      annotations
        .filter((a) => a.subtype === "highlight")
        .map((a) => ({ color: a.color, quads: a.quadPoints })),
    );
  }
  return out;
};

const mark = (pageIndex: number, color: string, rects: Mark["rects"]): Mark => ({
  pageIndex,
  color,
  rects,
});

describe("annotatePdf", () => {
  it("[export/annotated-pdf#AC-1] writes one highlight per mark with its color and quads from the top-left origin", async () => {
    const original = pdf(2);

    const annotated = await annotatePdf(original, [
      mark(0, "#F7D04F", [
        { x1: 20, y1: 100, x2: 120, y2: 114 },
        { x1: 20, y1: 80, x2: 90, y2: 94 },
      ]),
      mark(1, "#4F8EF7", [{ x1: 10, y1: 10, x2: 50, y2: 24 }]),
    ]);

    const [first, second] = await readBack(annotated);
    expect(first).toHaveLength(1);
    expect(first![0]!.color.toLowerCase()).toBe("#f7d04f");
    expect(first![0]!.quads).toEqual([
      {
        upperLeft: { x: 20, y: 86 },
        upperRight: { x: 120, y: 86 },
        lowerLeft: { x: 20, y: 100 },
        lowerRight: { x: 120, y: 100 },
      },
      {
        upperLeft: { x: 20, y: 106 },
        upperRight: { x: 90, y: 106 },
        lowerLeft: { x: 20, y: 120 },
        lowerRight: { x: 90, y: 120 },
      },
    ]);
    expect(second).toHaveLength(1);
    expect(second![0]!.color.toLowerCase()).toBe("#4f8ef7");
    expect(second![0]!.quads[0]!.upperLeft).toEqual({ x: 10, y: 176 });
    expect(Buffer.from(annotated).subarray(0, original.length).equals(Buffer.from(original))).toBe(
      true,
    );
    expect(annotated.length).toBeGreaterThan(original.length);
  });

  it("[export/annotated-pdf#AC-2] skips a mark on a page the file does not have and keeps the others", async () => {
    const annotated = await annotatePdf(pdf(1), [
      mark(5, "#FF0000", [{ x1: 1, y1: 1, x2: 2, y2: 2 }]),
      mark(0, "#00FF00", [{ x1: 1, y1: 1, x2: 20, y2: 12 }]),
    ]);

    const [page] = await readBack(annotated);
    expect(page).toHaveLength(1);
    expect(page![0]!.color.toLowerCase()).toBe("#00ff00");
  });

  it("[export/annotated-pdf#AC-2] returns the original bytes when there is nothing to write", async () => {
    const original = pdf(1);

    expect(Buffer.from(await annotatePdf(original, [])).equals(Buffer.from(original))).toBe(true);
    expect(
      Buffer.from(await annotatePdf(original, [mark(0, "#FF0000", [])])).equals(
        Buffer.from(original),
      ),
    ).toBe(true);
  });
});
