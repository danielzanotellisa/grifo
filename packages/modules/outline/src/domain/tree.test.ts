import { describe, expect, it } from "vitest";
import type { OutlineNode } from "./outline-node";
import { deleteNode, indentNode, moveNode, outdentNode, siblings } from "./tree";

const NOW = new Date("2026-01-01T00:00:00Z");
const LATER = new Date("2026-01-02T00:00:00Z");

function node(id: string, parentId: string | null, position: string): OutlineNode {
  return {
    id,
    ownerId: "u1",
    documentId: "d1",
    parentId,
    position,
    highlightId: null,
    role: "ITEM",
    text: id,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

const ids = (nodes: OutlineNode[]) => nodes.map((n) => n.id);

describe("indentNode", () => {
  it("[outline-node#AC-1] makes the node the last child of its previous sibling", () => {
    const tree = [node("A", null, "a0"), node("B", null, "a1"), node("C", null, "a2")];

    const result = indentNode(tree, "B", LATER);

    expect(ids(siblings(result, null))).toEqual(["A", "C"]);
    expect(ids(siblings(result, "A"))).toEqual(["B"]);
  });

  it("[outline-node#AC-1] appends after the existing children of the previous sibling", () => {
    const tree = [node("A", null, "a0"), node("X", "A", "a0"), node("B", null, "a1")];

    const result = indentNode(tree, "B", LATER);

    expect(ids(siblings(result, "A"))).toEqual(["X", "B"]);
  });

  it("[outline-node#AC-4] leaves the tree unchanged when there is no previous sibling", () => {
    const tree = [node("A", null, "a0"), node("B", null, "a1"), node("C", "B", "a0")];

    expect(indentNode(tree, "A", LATER)).toBe(tree);
    expect(indentNode(tree, "C", LATER)).toBe(tree);
  });

  it("does not mutate its input and stamps updatedAt on the changed node only", () => {
    const tree = [node("A", null, "a0"), node("B", null, "a1")];

    const result = indentNode(tree, "B", LATER);

    expect(tree[1]?.parentId).toBeNull();
    expect(result.find((n) => n.id === "B")?.updatedAt).toEqual(LATER);
    expect(result.find((n) => n.id === "A")?.updatedAt).toEqual(NOW);
  });

  it("rejects an unknown node with OUTLINE_NODE_NOT_FOUND", () => {
    expect(() => indentNode([node("A", null, "a0")], "Z", LATER)).toThrow(
      expect.objectContaining({ code: "OUTLINE_NODE_NOT_FOUND", status: 404 }),
    );
  });
});

describe("outdentNode", () => {
  it("[outline-node#AC-5] makes the node the next sibling of its parent", () => {
    const tree = [
      node("A", null, "a0"),
      node("B", "A", "a0"),
      node("C", "A", "a1"),
      node("D", null, "a1"),
    ];

    const result = outdentNode(tree, "B", LATER);

    expect(ids(siblings(result, null))).toEqual(["A", "B", "D"]);
    expect(ids(siblings(result, "A"))).toEqual(["C"]);
  });

  it("[outline-node#AC-5] goes last when the parent is the last root node", () => {
    const tree = [node("A", null, "a0"), node("B", "A", "a0")];

    expect(ids(siblings(outdentNode(tree, "B", LATER), null))).toEqual(["A", "B"]);
  });

  it("[outline-node#AC-4] leaves the tree unchanged for a root node", () => {
    const tree = [node("A", null, "a0"), node("B", null, "a1")];

    expect(outdentNode(tree, "B", LATER)).toBe(tree);
  });

  it("rejects an unknown node with OUTLINE_NODE_NOT_FOUND", () => {
    expect(() => outdentNode([node("A", null, "a0")], "Z", LATER)).toThrow(
      expect.objectContaining({ code: "OUTLINE_NODE_NOT_FOUND" }),
    );
  });
});

describe("deleteNode", () => {
  it("[outline-node#AC-2] promotes children into the deleted node's place, in order", () => {
    const tree = [
      node("A", null, "a0"),
      node("c1", "A", "a0"),
      node("c2", "A", "a1"),
      node("c3", "A", "a2"),
      node("B", null, "a1"),
    ];

    const result = deleteNode(tree, "A", LATER);

    expect(ids(siblings(result, null))).toEqual(["c1", "c2", "c3", "B"]);
    expect(result.find((n) => n.id === "A")?.deletedAt).toEqual(LATER);
  });

  it("[outline-node#AC-2] promotes children to the deleted node's parent, not the root", () => {
    const tree = [node("P", null, "a0"), node("A", "P", "a0"), node("c1", "A", "a0")];

    const result = deleteNode(tree, "A", LATER);

    expect(ids(siblings(result, "P"))).toEqual(["c1"]);
  });

  it("deletes a leaf without touching other nodes", () => {
    const tree = [node("A", null, "a0"), node("B", null, "a1")];

    const result = deleteNode(tree, "B", LATER);

    expect(ids(siblings(result, null))).toEqual(["A"]);
    expect(result.find((n) => n.id === "A")).toBe(tree[0]);
  });

  it("rejects an unknown or already deleted node with OUTLINE_NODE_NOT_FOUND", () => {
    const tree = [node("A", null, "a0")];
    const once = deleteNode(tree, "A", LATER);

    expect(() => deleteNode(tree, "Z", LATER)).toThrow(
      expect.objectContaining({ code: "OUTLINE_NODE_NOT_FOUND" }),
    );
    expect(() => deleteNode(once, "A", LATER)).toThrow(
      expect.objectContaining({ code: "OUTLINE_NODE_NOT_FOUND" }),
    );
  });
});

describe("moveNode", () => {
  it("[outline-node#AC-6] rejects moving a node under its own descendant", () => {
    const tree = [node("A", null, "a0"), node("B", "A", "a0")];

    expect(() => moveNode(tree, "A", { parentId: "B", afterId: null }, LATER)).toThrow(
      expect.objectContaining({ code: "OUTLINE_CYCLE", status: 422 }),
    );
    expect(tree[0]?.parentId).toBeNull();
  });

  it("[outline-node#AC-6] rejects moving a node under itself", () => {
    const tree = [node("A", null, "a0")];

    expect(() => moveNode(tree, "A", { parentId: "A", afterId: null }, LATER)).toThrow(
      expect.objectContaining({ code: "OUTLINE_CYCLE" }),
    );
  });

  it("places the node right after the given sibling under the new parent", () => {
    const tree = [
      node("A", null, "a0"),
      node("B", null, "a1"),
      node("x", "B", "a0"),
      node("y", "B", "a1"),
    ];

    const result = moveNode(tree, "A", { parentId: "B", afterId: "x" }, LATER);

    expect(ids(siblings(result, "B"))).toEqual(["x", "A", "y"]);
    expect(ids(siblings(result, null))).toEqual(["B"]);
  });

  it("places the node first when afterId is null", () => {
    const tree = [node("A", null, "a0"), node("B", null, "a1"), node("C", null, "a2")];

    const result = moveNode(tree, "C", { parentId: null, afterId: null }, LATER);

    expect(ids(siblings(result, null))).toEqual(["C", "A", "B"]);
  });

  it("rejects an unknown node, parent or sibling with OUTLINE_NODE_NOT_FOUND", () => {
    const tree = [node("A", null, "a0"), node("B", null, "a1")];
    const notFound = expect.objectContaining({ code: "OUTLINE_NODE_NOT_FOUND" });

    expect(() => moveNode(tree, "Z", { parentId: null, afterId: null }, LATER)).toThrow(notFound);
    expect(() => moveNode(tree, "A", { parentId: "Z", afterId: null }, LATER)).toThrow(notFound);
    expect(() => moveNode(tree, "A", { parentId: null, afterId: "Z" }, LATER)).toThrow(notFound);
  });
});
