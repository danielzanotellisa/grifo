import { describe, expect, it } from "vitest";
import { assertValidNode, effectiveRole } from "./outline-node";

describe("outline node", () => {
  it("inherits the category role when it has none", () => {
    expect(effectiveRole({ role: null }, "DEFINITION")).toBe("DEFINITION");
  });
  it("prefers its own role", () => {
    expect(effectiveRole({ role: "TOPIC" }, "ITEM")).toBe("TOPIC");
  });
  it("rejects a free-text node without text", () => {
    expect(() => assertValidNode({ highlightId: null, role: "ITEM", text: " " })).toThrow();
  });
});
