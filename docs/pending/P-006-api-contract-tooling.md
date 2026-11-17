# P-006. API contract tooling

- Status: open
- Blocks: the web client (generation of the OpenAPI document and schema sharing)
- Related: ADR 0014, 0021, 0036

## Problem
ADR 0014 wants the OpenAPI contract written before implementation; the client and server should share types and runtime validation.

## Options
- **OpenAPI-first**: hand-written `openapi.yaml` in `docs/specs`, generate TS types and validators from it.
- **Schema-first in code**: Zod schemas shared by client and server, OpenAPI generated from them (spec still reviewed before implementation).

## Partly decided
ADR 0036: Zod schemas are the source, route envelopes live in `apps/web/src/lib/http/schemas.ts`, and the route specs are the reviewed contract meanwhile.

## Still open
- Producing the OpenAPI document from the Zod schemas (ADR 0014 wants it reviewed before the Route Handlers).
- Sharing the schemas and types with the browser client without importing module internals.

## Closed elsewhere
`db/sql/rls.sql` stays an idempotent script run by `pnpm db:setup` (ADR 0032).

## How to close
Write the ADR for the Zod-based approach, add the OpenAPI generation, then set the status.
