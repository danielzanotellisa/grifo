# Module: identity

Accounts and sessions. Schema: `identity`. Spec: `docs/specs/user/`.

## Owns
- `identity.users`, `sessions`, `accounts`, `verifications`, `rate_limits`. The authentication library (Better Auth, ADR 0034) reads and writes them; our Drizzle schema defines them.

## Public API (`src/index.ts`)
- `User` type, `normalizeEmail`.
- `createMailOutbox(db)` (the messages waiting to be sent: `add`, `get`, `remove`, `expireOlderThan`) and `consumeRateLimit(db, { key, max, windowSeconds })` (one atomic upsert in `identity.rate_limits`, for routes the library does not serve).
- `createAuth(config)`, `createAuthDb(url)` (the pool of the auth role, built here because the library pulls its own copy of drizzle-orm and the types of the two are not interchangeable), `authenticate(auth, headers)` (the verified `{ userId, email }` of a request, or null), `deleteAccount({ db, auth, headers, password })`, and the types. The app builds the instance in the composition root with the auth pool, the secret and the `onSignIn` hook.

## Rules
- Emails are stored normalized (trimmed, lowercased); uniqueness is on the normalized value.
- Never hand-roll password hashing or token crypto: the library does the tokens and `@node-rs/argon2` the Argon2id hash.
- The `identity` schema belongs to the `auth_user` role (own pool, `DATABASE_AUTH_URL`). The application role has no access to it, and the tables have no RLS: grants protect them. Request code never queries them; it gets a `userId` from `authenticate` and then uses `withUser`.
- Every security-relevant setting is explicit in `createAuth` (origin and CSRF checks, rate limit in the database, `x-real-ip` as the client IP, `Secure` cookies under https, telemetry off). The library's defaults depend on the environment (its origin and CSRF checks are off under a test environment), so never rely on them, and never configure it elsewhere.
- Emails are never awaited inside a request: an awaited send would tell a known address from an unknown one. They leave through `identity.outgoing_mail` and the `auth.sendEmail` job (ADR 0035), which holds only ids: the link carries a token and a job payload is readable by the application role. After this, the reset response time differs by about 0.5 ms between a known and an unknown address (measured: 5.3 against 4.8 ms median), down from about 2 ms. The version of the library is pinned exactly; read its security advisories before upgrading.
- Deleting an account needs the current password, sets `deleted_at` and removes every session in one transaction. A hook refuses new sessions for a deleted account, and `authenticate` returns null for it, so a session that was open stops working. The email stays reserved until the purge (ADR 0018).
- `onSignIn` runs after every session is created (the app seeds the default categories there); a failure is logged and never blocks the sign-in.
- An email with surrounding spaces is refused (400); the client trims. The library stores addresses in lowercase.
- Account deletion = soft delete + purge job after the trash window (ADR 0018). `accountPurge` (`infra/purge.ts`) finds the expired accounts and removes their identity rows, on the admin connection, after every module has purged its data and objects (`user/purge`).

## Depends on
- `@app/platform` only. Nothing depends on identity internals; other modules only see a `userId: string`.
