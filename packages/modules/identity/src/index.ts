// Public API. Tables are NOT exported: other modules never touch this schema.
export type { User } from "./domain/user";
export { normalizeEmail } from "./domain/user";
