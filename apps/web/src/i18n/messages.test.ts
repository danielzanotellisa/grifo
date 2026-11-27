import { describe, expect, it } from "vitest";
import messages from "../../messages/pt-BR.json";

const leaves = (value: unknown, path = ""): [string, unknown][] =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key))
    : [[path, value]];

describe("pt-BR messages", () => {
  it("has no empty or non-string message", () => {
    const bad = leaves(messages).filter(
      ([, text]) => typeof text !== "string" || text.trim() === "",
    );

    expect(bad).toEqual([]);
  });
});
