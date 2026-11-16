import { v5 } from "uuid";

/** Part of the contract (ADR 0033): changing it would orphan every node created from a highlight. */
const OUTLINE_NODE_NAMESPACE = "6f1d7a3e-5b7c-4c8e-9a52-0d1f3b6e8c41";

/** The id of the outline node of a highlight. Client and server compute the same one. */
export const outlineNodeIdForHighlight = (highlightId: string): string =>
  v5(highlightId, OUTLINE_NODE_NAMESPACE);
