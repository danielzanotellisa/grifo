import { effectiveRole } from "@app/outline";
import { OUTLINE_ROLES } from "@app/platform";
import { describe, expect, it } from "vitest";
import {
  assertCanCreateFlashcard,
  canCreateFlashcard,
  deleteFlashcard,
  editFlashcard,
  newFlashcard,
  restoreFlashcard,
  updateFromSource,
} from "./flashcard";

const NOW = new Date("2026-01-01T00:00:00Z");
const LATER = new Date("2026-01-02T00:00:00Z");

const input = {
  id: "c1",
  ownerId: "u1",
  documentId: "d1",
  sourceNodeId: "n1",
  front: "TCP",
  nodeText: "protocolo orientado a conexão",
  now: NOW,
};

const card = () => newFlashcard(input);
const error = (code: string) => expect.objectContaining({ code, status: 422 });

describe("canCreateFlashcard", () => {
  it.each(OUTLINE_ROLES)(
    "[outline-node#AC-3] node with effective role %s offers a flashcard only for DEFINITION",
    (role) => {
      const own = { role };
      const inherited = { role: null };

      expect(canCreateFlashcard(effectiveRole(own, null))).toBe(role === "DEFINITION");
      expect(canCreateFlashcard(effectiveRole(inherited, role))).toBe(role === "DEFINITION");
    },
  );
});

describe("assertCanCreateFlashcard", () => {
  it.each(["TOPIC", "ITEM", "IGNORE"] as const)(
    "[flashcard#AC-1] rejects a %s node with FLASHCARD_REQUIRES_DEFINITION",
    (role) => {
      expect(() => assertCanCreateFlashcard(role)).toThrow(error("FLASHCARD_REQUIRES_DEFINITION"));
    },
  );

  it("accepts a DEFINITION node", () => {
    expect(() => assertCanCreateFlashcard("DEFINITION")).not.toThrow();
  });
});

describe("newFlashcard", () => {
  it("[flashcard#AC-2] keeps the back it copied when the node text is edited later", () => {
    let nodeText = "texto original";
    const created = newFlashcard({ ...input, nodeText });

    nodeText = "texto editado";

    expect(nodeText).toBe("texto editado");
    expect(created.back).toBe("texto original");
  });

  it("[flashcard#AC-4] creates a live card linked to the node with a trimmed copy as back", () => {
    const created = newFlashcard({
      ...input,
      front: " TCP ",
      nodeText: " protocolo orientado a conexão ",
    });

    expect(created).toEqual({
      id: "c1",
      ownerId: "u1",
      documentId: "d1",
      sourceNodeId: "n1",
      front: "TCP",
      back: "protocolo orientado a conexão",
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
  });

  it("[flashcard#AC-5] rejects a blank front or a blank node text", () => {
    expect(() => newFlashcard({ ...input, front: "  " })).toThrow(
      error("FLASHCARD_FRONT_REQUIRED"),
    );
    expect(() => newFlashcard({ ...input, nodeText: " \n " })).toThrow(
      error("FLASHCARD_BACK_EMPTY"),
    );
  });
});

describe("editFlashcard", () => {
  it("[flashcard#AC-6] sets trimmed front and back and keeps the id", () => {
    const edited = editFlashcard(card(), { front: " UDP ", back: " sem conexão " }, LATER);

    expect(edited).toMatchObject({
      id: "c1",
      front: "UDP",
      back: "sem conexão",
      createdAt: NOW,
      updatedAt: LATER,
    });
  });

  it("[flashcard#AC-5] rejects a blank front or back and leaves the card untouched", () => {
    const original = card();

    expect(() => editFlashcard(original, { front: "", back: "x" }, LATER)).toThrow(
      error("FLASHCARD_FRONT_REQUIRED"),
    );
    expect(() => editFlashcard(original, { front: "x", back: "  " }, LATER)).toThrow(
      error("FLASHCARD_BACK_EMPTY"),
    );
    expect(original).toEqual(card());
  });
});

describe("updateFromSource", () => {
  it("[flashcard#AC-7] copies the new trimmed node text into the back and keeps the front", () => {
    const updated = updateFromSource(card(), " texto novo ", LATER);

    expect(updated).toMatchObject({
      id: "c1",
      front: "TCP",
      back: "texto novo",
      updatedAt: LATER,
    });
  });

  it("[flashcard#AC-5] rejects a blank node text", () => {
    expect(() => updateFromSource(card(), "  ", LATER)).toThrow(error("FLASHCARD_BACK_EMPTY"));
  });

  it("[flashcard#AC-8] rejects a card whose node was deleted with FLASHCARD_SOURCE_GONE", () => {
    const orphan = { ...card(), sourceNodeId: null };

    expect(() => updateFromSource(orphan, "texto novo", LATER)).toThrow(
      error("FLASHCARD_SOURCE_GONE"),
    );
  });
});

describe("deleteFlashcard and restoreFlashcard", () => {
  it("[flashcard#AC-9] hides the card on delete and makes it live again on restore", () => {
    const deleted = deleteFlashcard(card(), LATER);
    const restored = restoreFlashcard(deleted, LATER);

    expect(deleted).toMatchObject({ deletedAt: LATER, updatedAt: LATER });
    expect(restored).toMatchObject({ deletedAt: null, updatedAt: LATER });
  });

  it("[flashcard#AC-9] changes nothing when deleting a deleted card or restoring a live one", () => {
    const live = card();
    const deleted = deleteFlashcard(live, LATER);

    expect(deleteFlashcard(deleted, new Date("2026-02-01T00:00:00Z"))).toBe(deleted);
    expect(restoreFlashcard(live, LATER)).toBe(live);
  });
});
