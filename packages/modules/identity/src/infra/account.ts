import { DomainError } from "@app/platform";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { AuthDb } from "./db";
import { authenticate, type Auth } from "./auth";
import { sessions, users } from "./schema";

/**
 * Deletes the account of the session in `headers`, after checking the current password: sets
 * `deletedAt` and removes every session in one transaction. The data stays until the purge job
 * (ADR 0018); the library refuses new sessions for a deleted account.
 */
export async function deleteAccount(input: {
  db: AuthDb;
  auth: Auth;
  headers: Headers;
  password: string;
}): Promise<void> {
  const current = await authenticate(input.auth, input.headers);
  if (!current) throw new DomainError("UNAUTHENTICATED", "Sign in required", 401);

  try {
    await input.auth.api.verifyPassword({
      body: { password: input.password },
      headers: input.headers,
    });
  } catch (error) {
    if (error instanceof APIError)
      throw new DomainError("INVALID_CREDENTIALS", "The password is wrong", 401);
    throw error;
  }

  const now = new Date();
  await input.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(users.id, current.userId));
    await tx.delete(sessions).where(eq(sessions.userId, current.userId));
  });
}
