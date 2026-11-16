import { describe, expect, it } from "vitest";
import { normalizeQuoteText } from "./highlight";

describe("normalizeQuoteText", () => {
  it("expands ligatures", () => {
    expect(normalizeQuoteText("deﬁnição")).toBe("definição");
  });
  it("joins words split by a line-break hyphen", () => {
    expect(normalizeQuoteText("o TCP é orien-\ntado a conexão")).toBe("o TCP é orientado a conexão");
  });
  it("turns internal newlines into single spaces", () => {
    expect(normalizeQuoteText("  garante a entrega\n  ordenada  ")).toBe("garante a entrega ordenada");
  });
});
