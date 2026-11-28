import type { OutlineRole } from "@app/platform";

export type SummaryNode = {
  id: string;
  depth: number; // 1 for a root, counting only the nodes shown above
  topicLevel: number; // number of TOPIC ancestors + 1 (the heading level of a TOPIC)
  role: Exclude<OutlineRole, "IGNORE">;
  text: string;
  color: string | null;
  page: number | null; // 1-based
};

export type SummarySource = {
  nodes: {
    id: string;
    parentId: string | null;
    position: string;
    highlightId: string | null;
    role: OutlineRole | null;
    text: string | null;
  }[];
  highlights: Map<string, { quote: string; role: OutlineRole; color: string; pageIndex: number }>;
};

/**
 * The live nodes of one document as the summary shows them, in reading order (`export/summary-pdf`).
 * A node with no role, or `IGNORE`, is left out and its children take its place; a node whose
 * parent is missing is a root; nodes that are only reachable through a cycle are dropped.
 */
export function orderSummary({ nodes, highlights }: SummarySource): SummaryNode[] {
  const known = new Set(nodes.map((n) => n.id));
  const children = new Map<string | null, SummarySource["nodes"]>();
  for (const node of nodes) {
    const parent = node.parentId !== null && known.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  for (const list of children.values()) {
    list.sort((a, b) =>
      a.position === b.position ? (a.id < b.id ? -1 : 1) : a.position < b.position ? -1 : 1,
    );
  }

  const out: SummaryNode[] = [];
  const visit = (parentId: string | null, depth: number, topicLevel: number) => {
    for (const node of children.get(parentId) ?? []) {
      const highlight = node.highlightId ? highlights.get(node.highlightId) : undefined;
      const role = node.role ?? highlight?.role ?? null;
      const text = node.text ?? highlight?.quote ?? null;
      if (role === null || role === "IGNORE" || text === null) {
        visit(node.id, depth, topicLevel);
        continue;
      }
      out.push({
        id: node.id,
        depth,
        topicLevel,
        role,
        text,
        color: highlight?.color ?? null,
        page: highlight ? highlight.pageIndex + 1 : null,
      });
      visit(node.id, depth + 1, role === "TOPIC" ? topicLevel + 1 : topicLevel);
    }
  };
  visit(null, 1, 1);
  return out;
}
