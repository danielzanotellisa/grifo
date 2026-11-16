/**
 * Fixed system behavior of an outline entry (ADR 0013).
 * User-defined Categories (name + color) each point to one role.
 * Mirrored as a Postgres enum in the annotation and outline schemas: change both together.
 */
export const OUTLINE_ROLES = ["TOPIC", "DEFINITION", "ITEM", "IGNORE"] as const;
export type OutlineRole = (typeof OUTLINE_ROLES)[number];
