# 0034. Authentication with Better Auth, a dedicated database role and sessions in Postgres

- Status: accepted
- Date: 2026-11-16
- Related: 0003, 0012, 0016, 0029, 0032

## Context
`P-005` asked for email and password with verification and reset, sessions in Postgres (no Redis), Drizzle and Next.js Route Handlers, permissive licenses and revocable sessions, always through an established library (ADR 0003). A comparison of Better Auth, Auth.js, the Lucia family, a hand-rolled layer and hosted services was followed by a throwaway spike against our schema, roles and RLS. Findings that shape this decision:
- Auth.js was absorbed by the Better Auth team and v5 is still beta; Lucia and `oslo` are deprecated; hosted services conflict with ADR 0003, the single datastore and LGPD.
- Better Auth 1.7.25 (MIT) runs on our own tables in the `identity` schema, with UUIDv7 ids, Argon2id hashing, a database rate limiter, revocable sessions and an opt-in telemetry.
- Our login must find a user by email before it knows who the user is, so it cannot run under the per-user RLS of ADR 0016.
- The library had many security advisories in 2026, most in optional plugins (organization, OIDC, device, magic link, 2FA).
- Its origin and CSRF checks are off by default in a test environment (`skipOriginCheck` follows `isTest()`).
- With only `deleted_at` set, a session that is already open stays valid.
- Password reset answered identically for a known and an unknown email, but the known path took about 2 ms longer.

## Decision
1. **Library.** Better Auth, pinned to an exact version, with email and password only. Google OAuth is a later slice. No plugins: not organization, OIDC, device authorization, magic link, email OTP or 2FA until a spec asks for them. Upgrades are deliberate, with the test suite, and follow its security advisories.
2. **Tables.** `users`, `sessions`, `accounts`, `verifications` and `rate_limits` live in the `identity` schema and are defined in our Drizzle schema, which the adapter uses. Ids are UUIDv7 (`generateId`), and the library's `name` maps to `display_name`.
3. **Passwords.** Argon2id through `@node-rs/argon2` (64 MiB, 3 iterations, parallelism 4), length 10 to 128.
4. **Database access.** A dedicated role `auth_user` has privileges only on the `identity` schema and its own pool (`DATABASE_AUTH_URL`). `app_user` has no access to `identity`, so request code cannot read a password hash or a session. The identity tables carry no RLS: grants protect them. Request code gets a verified `userId` from the session and then uses `withUser` as before.
5. **Explicit configuration.** Nothing security-relevant depends on the environment default: origin and CSRF checks on, rate limiting on with database storage, the client IP read from a header the reverse proxy sets (`x-real-ip`) and never from `X-Forwarded-For`, telemetry off, `Secure` cookies when the base URL is https, `HttpOnly` and `SameSite=Lax`.
6. **No account enumeration.** Sign-up for an existing email and password reset answer as for a new or known one (the `EMAIL_TAKEN` error of the first draft of the `user` spec is dropped). Emails leave through the job queue, never inside the request (ADR 0029), so the response time does not depend on the SMTP server.
7. **Deleted accounts.** Deleting an account soft-deletes it and revokes all its sessions in one transaction; a hook refuses new sessions for a deleted account, and the request guard also checks `deleted_at`.
8. **Dependencies between modules.** `identity` exposes the auth instance and a function that turns request headers into a `userId`. Side effects of a first sign-in (the default categories) are injected by the composition root, so `identity` still depends only on `platform`.

## Considered options
- Hand-rolled sessions on `@node-rs/argon2`, `nodemailer` and our own tables: full control and no plugin surface, but 1 to 2 weeks of work, every security bug ours, and it goes against the intent of ADR 0003. Kept as the fallback if Better Auth proves unfit.
- Auth.js: absorbed by Better Auth, v5 beta, no built-in reset or rate limiting.
- Lucia, `oslo`, `arctic`: deprecated.
- Hosted identity (Clerk, Auth0, Supabase): conflicts with ADR 0003, one datastore and LGPD residency.
- Functions `SECURITY DEFINER` instead of a second role: do not work, because the library queries its tables directly.

## Consequences
Two database pools and two roles to provision; `roles.sql` and `rls.sql` change. The library's governance (it joined Vercel in July 2026) and its advisory cadence are a standing risk, so the version is pinned and the fallback stays documented. The residual 2 ms timing difference of the reset flow is accepted once emails go through the queue. Tests must never rely on the library's environment defaults.
