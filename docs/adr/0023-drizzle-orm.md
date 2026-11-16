# 0023. Drizzle ORM with one schema per module

- Status: accepted
- Date: 2026-11-15
- Related: 0002, 0016

## Context
The data layer must support one Postgres schema per module, RLS through a per-transaction setting, transactional job enqueueing with raw SQL, and type safety.

## Decision
Drizzle ORM and drizzle-kit. Each module declares its tables with `pgSchema("<module>")` in `src/infra/schema.ts`; one migration history for the monolith. Cross-module references are plain UUID columns without foreign keys. RLS policies are applied by SQL (`db/sql/rls.sql`) until moved into custom migrations.

## Considered options
- Prisma: RLS needs workarounds around interactive transactions; multi-schema is heavier.
- Kysely: excellent query builder, but no schema declaration or migration generation.
- Raw SQL: loses type safety.

## Consequences
SQL stays visible; `withUser` is a plain transaction plus `set_config`. Tables are never exported from a module's public API.
