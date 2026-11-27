import { describe, expect, it } from "vitest";
import {
  flatten,
  indent,
  moveAmongSiblings,
  outdent,
  positionAfter,
  siblings,
  type NodeData,
} from "./outline-tree";

const node = (
  id: string,
  parentId: string | null,
  position: string,
  role: NodeData["role"] = "ITEM",
): NodeData => ({
  id,
  documentId: "d1",
  parentId,
  position,
  highlightId: null,
  role,
  text: id,
});
const apply = (nodes: NodeData[], changed: NodeData | null) =>
  changed ? nodes.map((n) => (n.id === changed.id ? changed : n)) : nodes;
const order = (nodes: NodeData[], parentId: string | null) =>
  siblings(nodes, parentId).map((n) => n.id);

describe("outline tree operations", () => {
  it("[outline-node/screens#AC-9] indents the second of three siblings under the first and leaves the third at the root", () => {
    const nodes = [node("A", null, "a0"), node("B", null, "a1"), node("C", null, "a2")];

    const after = apply(nodes, indent(nodes, "B"));

    expect(order(after, null)).toEqual(["A", "C"]);
    expect(order(after, "A")).toEqual(["B"]);
  });

  it("[outline-node/screens#AC-9] indents under the last child of the previous sibling's children, and refuses the first sibling", () => {
    const nodes = [node("A", null, "a0"), node("A1", "A", "a0"), node("B", null, "a1")];

    const after = apply(nodes, indent(nodes, "B"));

    expect(order(after, "A")).toEqual(["A1", "B"]);
    expect(after.find((n) => n.id === "B")!.position > "a0").toBe(true);
    expect(indent(nodes, "A")).toBeNull();
    expect(indent(nodes, "missing")).toBeNull();
  });

  it("[outline-node/screens#AC-9] outdents a child between its parent and the parent's next sibling, and refuses a root node", () => {
    const nodes = [
      node("A", null, "a0"),
      node("B", "A", "a0"),
      node("C", "A", "a1"),
      node("D", null, "a1"),
    ];

    const after = apply(nodes, outdent(nodes, "B"));

    expect(order(after, null)).toEqual(["A", "B", "D"]);
    expect(order(after, "A")).toEqual(["C"]);
    expect(outdent(nodes, "A")).toBeNull();
  });

  it("[outline-node/screens#AC-9] moves a node among its siblings between the right neighbors, and refuses the ends", () => {
    const nodes = [node("A", null, "a0"), node("B", null, "a1"), node("C", null, "a2")];

    const up = apply(nodes, moveAmongSiblings(nodes, "C", -1));
    const down = apply(nodes, moveAmongSiblings(nodes, "A", 1));

    expect(order(up, null)).toEqual(["A", "C", "B"]);
    expect(order(down, null)).toEqual(["B", "A", "C"]);
    expect(moveAmongSiblings(nodes, "A", -1)).toBeNull();
    expect(moveAmongSiblings(nodes, "C", 1)).toBeNull();
  });

  it("[outline-node/screens#AC-9] changes only the node that moved", () => {
    const nodes = [node("A", null, "a0"), node("B", null, "a1"), node("C", null, "a2")];

    const changed = indent(nodes, "B")!;

    expect(changed).toMatchObject({
      id: "B",
      documentId: "d1",
      highlightId: null,
      role: "ITEM",
      text: "B",
    });
    expect(nodes.find((n) => n.id === "A")).toEqual(node("A", null, "a0"));
  });

  it("[outline-node/screens#AC-6] places a new node after the selected one among its siblings, or last at the root", () => {
    const nodes = [node("A", null, "a0"), node("B", null, "a2"), node("A1", "A", "a0")];

    const afterA = positionAfter(nodes, "A");
    const afterA1 = positionAfter(nodes, "A1");
    const last = positionAfter(nodes, null);

    expect(afterA.parentId).toBeNull();
    expect(afterA.position > "a0" && afterA.position < "a2").toBe(true);
    expect(afterA1.parentId).toBe("A");
    expect(afterA1.position > "a0").toBe(true);
    expect(last).toMatchObject({ parentId: null });
    expect(last.position > "a2").toBe(true);
  });

  it("[outline-node/screens#AC-1] flattens in position order with depth, topic level, and a missing parent at the root", () => {
    const nodes = [
      node("T1", null, "a0", "TOPIC"),
      node("T2", "T1", "a0", "TOPIC"),
      node("I1", "T2", "a0", "ITEM"),
      node("D1", "T1", "a1", "DEFINITION"),
      node("lost", "ghost", "a1", "ITEM"),
      node("I2", null, "a2", "ITEM"),
      node("I3", "I2", "a0", "ITEM"),
      node("T3", "I3", "a0", "TOPIC"),
    ];

    const rows = flatten(nodes, (n) => n.role);

    expect(rows.map((r) => [r.node.id, r.depth, r.topicLevel])).toEqual([
      ["T1", 1, 1],
      ["T2", 2, 2],
      ["I1", 3, 3],
      ["D1", 2, 2],
      ["lost", 1, 1],
      ["I2", 1, 1],
      ["I3", 2, 1],
      ["T3", 3, 1],
    ]);
  });
});
