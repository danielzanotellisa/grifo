# P-006. API contract tooling

- Status: open
- Blocks: first Route Handlers
- Related: ADR 0014, 0021

## Problem
ADR 0014 wants the OpenAPI contract written before implementation; the client and server should share types and runtime validation.

## Options
- **OpenAPI-first**: hand-written `openapi.yaml` in `docs/specs`, generate TS types and validators from it.
- **Schema-first in code**: Zod schemas shared by client and server, OpenAPI generated from them (spec still reviewed before implementation).

## Also
Move `db/sql/rls.sql` into drizzle custom migrations.

## How to close
Pick one, write the ADR, add the toolchain.
