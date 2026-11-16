import { describe, expect, it } from "vitest";
import { deckName } from "./deck";

describe("deckName", () => {
  it("builds the hierarchy and neutralizes '::' in user names", () => {
    expect(deckName("Redes", "TCP::básico")).toBe("Redes::TCP:básico");
  });
});
