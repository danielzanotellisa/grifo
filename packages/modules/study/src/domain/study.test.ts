import { describe, expect, it } from "vitest";
import { deckName } from "./deck";
import { assertCanCreateFlashcard, newFlashcard } from "./flashcard";

describe("flashcards", () => {
  it("only accepts DEFINITION nodes", () => {
    expect(() => assertCanCreateFlashcard("ITEM")).toThrow();
    expect(() => assertCanCreateFlashcard("DEFINITION")).not.toThrow();
  });
  it("copies and trims the node text into the back", () => {
    const card = newFlashcard({
      id: "c1",
      ownerId: "u1",
      documentId: "d1",
      sourceNodeId: "n1",
      front: " TCP ",
      nodeText: " protocolo orientado a conexão ",
      now: new Date(0),
    });
    expect(card.front).toBe("TCP");
    expect(card.back).toBe("protocolo orientado a conexão");
  });
});

describe("deckName", () => {
  it("builds the hierarchy and neutralizes '::' in user names", () => {
    expect(deckName("Redes", "TCP::básico")).toBe("Redes::TCP:básico");
  });
});
