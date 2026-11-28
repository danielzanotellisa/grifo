import { describe, expect, it } from "vitest";
import { normalizeQuoteText } from "./highlight";

describe("normalizeQuoteText", () => {
  it("expands ligatures", () => {
    expect(normalizeQuoteText("deﬁnição")).toBe("definição");
  });
  it("joins words split by a line-break hyphen", () => {
    expect(normalizeQuoteText("o TCP é orien-\ntado a conexão")).toBe(
      "o TCP é orientado a conexão",
    );
  });
  it("[highlight#AC-14] removes a soft hyphen wherever it appears, not only before a line break", () => {
    expect(normalizeQuoteText("inter\u00ADnet e re\u00ADdes")).toBe("internet e redes");
    expect(normalizeQuoteText("orien\u00AD\ntado")).toBe("orientado");
  });
  it("turns internal newlines into single spaces", () => {
    expect(normalizeQuoteText("  garante a entrega\n  ordenada  ")).toBe(
      "garante a entrega ordenada",
    );
  });
});
