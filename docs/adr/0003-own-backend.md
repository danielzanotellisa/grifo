# 0003. Own backend instead of a BaaS

- Status: accepted
- Date: 2026-11-15

## Context
A BaaS would speed up the MVP but ties business rules to a vendor. Sync, exports and authorization are central to the product and worth owning.

## Decision
Own HTTP/JSON API over PostgreSQL and S3-compatible storage. Email/password plus Google OAuth, always through an established library; no hand-rolled crypto or password hashing.

## Considered options
- Supabase/Firebase: vendor coupling.
- Hosted identity (Auth0, Clerk, Keycloak): kept as a fallback if own auth proves costly.

## Consequences
More code and more security responsibility (authorization on every route, rate limiting, password recovery, email verification). No vendor lock-in beyond the S3 protocol.
