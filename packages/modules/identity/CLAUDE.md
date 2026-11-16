# Module: identity

Accounts and sessions. Schema: `identity`. Spec: `docs/specs/user/`.

## Owns
- `identity.users`, `sessions`, `accounts`, `verifications`, `rate_limits`. The authentication library (Better Auth, ADR 0034) reads and writes them; our Drizzle schema defines them.

## Public API (`src/index.ts`)
- `User` type, `normalizeEmail`.
- `createAuth(config)`, `authenticate(auth, headers)` (the verified `userId` of a request, or null), `Auth`, `AuthConfig`, `AuthMail`. The app builds the instance in the composition root with the auth pool and the secret.

## Rules
- Emails are stored normalized (trimmed, lowercased); uniqueness is on the normalized value.
- Never hand-roll password hashing or token crypto: the library does the tokens and `@node-rs/argon2` the Argon2id hash.
- The `identity` schema belongs to the `auth_user` role (own pool, `DATABASE_AUTH_URL`). The application role has no access to it, and the tables have no RLS: grants protect them. Request code never queries them; it gets a `userId` from `authenticate` and then uses `withUser`.
- Every security-relevant setting is explicit in `createAuth` (origin and CSRF checks, rate limit in the database, `x-real-ip` as the client IP, `Secure` cookies under https, telemetry off). The library's defaults depend on the environment (its origin and CSRF checks are off under a test environment), so never rely on them, and never configure it elsewhere.
- Emails are never awaited inside a request: an awaited send would tell a known address from an unknown one. The version of the library is pinned exactly; read its security advisories before upgrading.
- An email with surrounding spaces is refused (400); the client trims. The library stores addresses in lowercase.
- Account deletion = soft delete + purge job after the trash window (ADR 0018); the purge must also remove every object in storage owned by the user.

## Depends on
- `@app/platform` only. Nothing depends on identity internals; other modules only see a `userId: string`.
