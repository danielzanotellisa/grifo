# 0016. Owner-based authorization with Row Level Security

- Status: accepted
- Date: 2026-11-15

## Context
In the MVP all data belongs to one user and nothing is shared. The classic failure is IDOR: a route loads by id and forgets to check the owner.

## Decision
Two layers. Application: every domain table has `owner_id` and every repository filters by it; ids are UUIDs. Database: RLS on every domain table with `owner_id = current_setting('app.user_id')::uuid`, set per transaction by `withUser`. The app connects with a role that cannot bypass RLS; migrations and admin jobs use another role. Storage URLs are presigned only after an ownership check.

## Considered options
- Application checks only: one omission becomes a leak.
- Database per user: operational cost.

## Consequences
Tests try to access another user's resources on every route and expect 404 (not 403). Future sharing adds a policy on the snapshot entity (0011) without touching existing policies.
