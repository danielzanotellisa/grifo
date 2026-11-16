import { hash, verify } from "@node-rs/argon2";
import { newId } from "@app/platform";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import type { AuthDb } from "./db";
import { accounts, rateLimits, sessions, users, verifications } from "./schema";

export type AuthMail = { to: string; url: string; token: string };

export type AuthConfig = {
  /** Connection of the authentication role: the only one that can read the identity schema (ADR 0034). */
  db: AuthDb;
  /** At least 32 characters; one per environment. */
  secret: string;
  /** Public origin of the app. Under https the cookies are `Secure`. */
  baseURL: string;
  sendVerificationEmail(mail: AuthMail): Promise<void>;
  sendResetPassword(mail: AuthMail): Promise<void>;
  /**
   * Called after every session is created, with the user id (the app seeds the default categories here).
   * A failure is logged and never blocks the sign-in.
   */
  onSignIn?(userId: string): Promise<void>;
};

// 64 MiB, 3 iterations, parallelism 4. The library's `Algorithm.Argon2id` is a const enum: 2.
const ARGON2ID = { memoryCost: 65536, timeCost: 3, parallelism: 4, algorithm: 2 } as const;

/**
 * The authentication instance. Every security-relevant setting is explicit: the library's defaults
 * depend on the environment (its origin and CSRF checks are off in a test environment), so none is
 * left to them (ADR 0034).
 */
export function createAuth(config: AuthConfig) {
  if (config.secret.length < 32) {
    throw new Error("The authentication secret must have at least 32 characters");
  }

  // Emails never delay the response: a send that is awaited would tell a known address from an unknown one.
  const dispatch = (send: (mail: AuthMail) => Promise<void>, mail: AuthMail) => {
    send(mail).catch((error: unknown) => console.error("authentication email failed", error));
  };

  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    telemetry: { enabled: false },
    database: drizzleAdapter(config.db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications, rateLimits },
    }),
    user: {
      modelName: "users",
      fields: { name: "displayName" },
      additionalFields: { deletedAt: { type: "date", required: false, input: false } },
    },
    session: { modelName: "sessions" },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    rateLimit: { enabled: true, storage: "database", modelName: "rateLimits" },
    advanced: {
      database: { generateId: () => newId() },
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: config.baseURL.startsWith("https://"),
    },
    databaseHooks: {
      session: {
        create: {
          // A deleted account never gets a new session (its open ones are removed when it is deleted).
          before: async (session) => {
            const [row] = await config.db
              .select({ deletedAt: users.deletedAt })
              .from(users)
              .where(eq(users.id, session.userId));
            if (row?.deletedAt) return false;
          },
          after: async (session) => {
            await config.onSignIn?.(session.userId).catch((error: unknown) => {
              console.error("onSignIn failed", error);
            });
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => hash(password, ARGON2ID),
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
      sendResetPassword: async ({ user, url, token }) =>
        dispatch(config.sendResetPassword, { to: user.email, url, token }),
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url, token }) =>
        dispatch(config.sendVerificationEmail, { to: user.email, url, token }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Turns the headers of a request into the verified user, or null when there is no valid session or
 * the account was deleted (a session that was open at the time must stop working).
 */
export async function authenticate(
  auth: Auth,
  headers: Headers,
): Promise<{ userId: string; email: string } | null> {
  const session = await auth.api.getSession({ headers });
  if (!session || session.user.deletedAt) return null;
  return { userId: session.user.id, email: session.user.email };
}
