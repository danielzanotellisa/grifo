// Public API. Tables are NOT exported: other modules never touch this schema.
export type { User } from "./domain/user";
export { normalizeEmail } from "./domain/user";
export { deleteAccount } from "./infra/account";
export { createAuthDb } from "./infra/db";
export { accountPurge } from "./infra/purge";
export { createMailOutbox } from "./infra/mail-outbox";
export type { MailKind, MailOutbox, OutgoingMail } from "./infra/mail-outbox";
export { consumeRateLimit } from "./infra/rate-limit";
export type { AuthDb } from "./infra/db";
export { authenticate, createAuth } from "./infra/auth";
export type { Auth, AuthConfig, AuthMail } from "./infra/auth";
