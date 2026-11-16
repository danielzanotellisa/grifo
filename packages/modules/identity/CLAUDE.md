# Module: identity

Accounts and sessions. Schema: `identity`. Spec: `docs/specs/user/`.

## Owns
- `User` (table `identity.users`). Session/credential tables depend on the auth decision (`docs/pending/P-005`); do not add them before it is closed.

## Public API (`src/index.ts`)
- `User` type, `normalizeEmail`.

## Rules
- Emails are stored normalized (trimmed, lowercased); uniqueness is on the normalized value.
- Never hand-roll password hashing or token crypto; use the library chosen in P-005.
- Account deletion = soft delete + purge job after the trash window (ADR 0018); the purge must also remove every object in storage owned by the user.
- RLS on `users` is "self only" (`id = app.user_id`), not `owner_id`.

## Depends on
- `@app/platform` only. Nothing depends on identity internals; other modules only see a `userId: string`.
