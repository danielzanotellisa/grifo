import { DomainError, OUTLINE_ROLES } from "@app/platform";
import { z } from "zod";
import { assertValidNode } from "../domain/outline-node";

const nodeData = z
  .object({
    id: z.uuid(),
    documentId: z.uuid(),
    parentId: z.uuid().nullable(),
    position: z.string().min(1),
    highlightId: z.uuid().nullable(),
    role: z.enum(OUTLINE_ROLES).nullable(),
    text: z.string().nullable(),
  })
  .strict();

const deleteData = z.object({ id: z.uuid() });

export type NodeData = z.infer<typeof nodeData>;

const invalid = (issues: z.core.$ZodIssue[]) =>
  new DomainError("OUTLINE_NODE_INVALID", "The outline node data is invalid", 422, {
    issues: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });

/** Validates the `data` of an upsert mutation, including the node invariants. */
export function parseNodeData(data: unknown): NodeData {
  const parsed = nodeData.safeParse(data);
  if (!parsed.success) throw invalid(parsed.error.issues);
  assertValidNode(parsed.data);
  return parsed.data;
}

/** Validates the `data` of a delete mutation: only the id matters. */
export function parseDeleteData(data: unknown): { id: string } {
  const parsed = deleteData.safeParse(data);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return parsed.data;
}
