import { describe, expect, it } from "vitest";
import { toPdfRect, toTopLeftBox } from "./geometry";

describe("page geometry", () => {
  it("[highlight/screens#AC-8] reports a top-left box of the engine in bottom-left PDF points", () => {
    // the first line of an A4 page: 58.3 points from the top, 13.28 high
    const rect = toPdfRect({ x: 56.25, y: 58.3, width: 205.74, height: 13.28 }, 842.88);

    expect(rect.x1).toBeCloseTo(56.25);
    expect(rect.x2).toBeCloseTo(261.99);
    expect(rect.y2).toBeCloseTo(784.58);
    expect(rect.y1).toBeCloseTo(771.3);
    expect(rect.y2).toBeGreaterThan(rect.y1);
  });

  it("[highlight/screens#AC-8] converts back to the same box", () => {
    const box = { x: 12.5, y: 700.25, width: 99, height: 11 };

    const again = toTopLeftBox(toPdfRect(box, 842.88), 842.88);

    expect(again.x).toBeCloseTo(box.x);
    expect(again.y).toBeCloseTo(box.y);
    expect(again.width).toBeCloseTo(box.width);
    expect(again.height).toBeCloseTo(box.height);
  });
});
