# P-005. Authentication library and sessions

- Status: open
- Blocks: identity module tables, all authenticated routes
- Related: ADR 0003, 0016, spec `user`

## Requirements
Email/password with verification and reset; Google OAuth; database sessions in Postgres (no Redis); works with Drizzle and Next.js Route Handlers; permissive license; session revocation (account deletion).

## Options
- An auth library for Next.js/TypeScript with a Drizzle adapter (evaluate the current maintained options against the requirements).
- Own session handling with a vetted password-hashing library (Argon2id) and an OAuth client library.
- Hosted identity provider (Auth0, Clerk, Keycloak self-hosted).

## How to close
Evaluate against the requirements and licenses, write the ADR, then the identity tables.
