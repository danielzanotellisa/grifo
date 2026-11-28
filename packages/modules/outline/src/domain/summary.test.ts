import { describe, expect, it } from "vitest";
import { orderSummary, type SummarySource } from "./summary";

const node = (
  id: string,
  parentId: string | null,
  position: string,
  over: Partial<SummarySource["nodes"][number]> = {},
): SummarySource["nodes"][number] => ({
  id,
  parentId,
  position,
  highlightId: null,
  role: "ITEM",
  text: id,
  ...over,
});

describe("orderSummary", () => {
  it("[export/summary-pdf#AC-1] orders siblings by position and ties by id, with depth and topic level", () => {
    const result = orderSummary({
      nodes: [
        node("b", null, "a1", { role: "TOPIC" }),
        node("a", null, "a0", { role: "TOPIC" }),
        node("a2", "a", "a1", { role: "TOPIC" }),
        node("a1", "a", "a0"),
        node("a3", "a2", "a0", { role: "DEFINITION" }),
        node("z", null, "a1", { role: "ITEM" }),
      ],
      highlights: new Map(),
    });

    expect(result.map((n) => [n.id, n.depth, n.topicLevel])).toEqual([
      ["a", 1, 1],
      ["a1", 2, 2],
      ["a2", 2, 2],
      ["a3", 3, 3],
      ["b", 1, 1],
      ["z", 1, 1],
    ]);
  });

  it("[export/summary-pdf#AC-1] takes text, role, color and page from the highlight, and an own text or role wins", () => {
    const highlights: SummarySource["highlights"] = new Map([
      ["h1", { quote: "trecho", role: "DEFINITION", color: "#F7D04F", pageIndex: 4 }],
      ["h2", { quote: "outro", role: "ITEM", color: "#5BC17F", pageIndex: 0 }],
    ]);

    const result = orderSummary({
      nodes: [
        node("n1", null, "a0", { highlightId: "h1", role: null, text: null }),
        node("n2", null, "a1", { highlightId: "h2", role: "TOPIC", text: "Texto próprio" }),
        node("n3", null, "a2"),
      ],
      highlights,
    });

    expect(result).toEqual([
      {
        id: "n1",
        depth: 1,
        topicLevel: 1,
        role: "DEFINITION",
        text: "trecho",
        color: "#F7D04F",
        page: 5,
      },
      {
        id: "n2",
        depth: 1,
        topicLevel: 1,
        role: "TOPIC",
        text: "Texto próprio",
        color: "#5BC17F",
        page: 1,
      },
      { id: "n3", depth: 1, topicLevel: 1, role: "ITEM", text: "n3", color: null, page: null },
    ]);
  });

  it("[export/summary-pdf#AC-1] leaves out nodes with no role or IGNORE, and their children take their place", () => {
    const highlights: SummarySource["highlights"] = new Map([
      ["h1", { quote: "ignorado", role: "IGNORE", color: "#000000", pageIndex: 0 }],
    ]);

    const result = orderSummary({
      nodes: [
        node("t", null, "a0", { role: "TOPIC" }),
        node("ign", "t", "a0", { highlightId: "h1", role: null, text: null }),
        node("child", "ign", "a0"),
        node("orphanHighlight", "t", "a1", { highlightId: "gone", role: null, text: null }),
      ],
      highlights,
    });

    expect(result.map((n) => [n.id, n.depth])).toEqual([
      ["t", 1],
      ["child", 2],
    ]);
  });

  it("[export/summary-pdf#AC-1] treats a node whose parent is missing as a root, and survives a cycle", () => {
    const result = orderSummary({
      nodes: [node("ghost", "nowhere", "a0"), node("x", "y", "a1"), node("y", "x", "a2")],
      highlights: new Map(),
    });

    expect(result.map((n) => n.id)).toEqual(["ghost"]);
  });
});
