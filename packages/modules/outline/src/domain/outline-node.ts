import { DomainError, type OutlineRole } from "@app/platform";

export type OutlineNode = {
  id: string;
  ownerId: string;
  documentId: string;
  parentId: string | null;
  position: string; // fractional index among siblings
  highlightId: string | null;
  role: OutlineRole | null; // null = inherit from the highlight's category
  text: string | null; // null = use the highlight quote
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export function assertValidNode(node: Pick<OutlineNode, "highlightId" | "role" | "text">): void {
  if (
    node.highlightId === null &&
    (node.role === null || node.text === null || node.text.trim() === "")
  ) {
    throw new DomainError(
      "OUTLINE_NODE_INVALID",
      "A free-text node needs a role and non-empty text",
      422,
    );
  }
  if (node.role === "IGNORE") {
    throw new DomainError(
      "OUTLINE_NODE_INVALID",
      "IGNORE highlights do not produce outline nodes",
      422,
    );
  }
}

/** Role the node actually behaves as. `categoryRole` is the role of the highlight's category, if any. */
export function effectiveRole(
  node: Pick<OutlineNode, "role">,
  categoryRole: OutlineRole | null,
): OutlineRole {
  const role = node.role ?? categoryRole;
  if (role === null) {
    throw new DomainError(
      "OUTLINE_NODE_INVALID",
      "Node has no role and no highlight category role",
      422,
    );
  }
  return role;
}
