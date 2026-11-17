# 0036. API contract: Zod schemas are the source, the OpenAPI document comes later

- Status: accepted
- Date: 2026-11-17
- Related: 0014, 0021, 0022

## Context
ADR 0014 wants the contract reviewed before the Route Handlers. `P-006` listed two ways to get there: a hand-written `openapi.yaml` that generates types and validators, or schemas in code from which the document is generated. The first sync routes are the first HTTP surface with a contract, and the entity payloads are already validated with Zod inside each module.

## Decision
1. **Source of truth.** Zod schemas validate every request body and query. The request and response shapes of a route are written in its spec (`docs/specs`), reviewed and approved before the route exists; that spec is the reviewed contract of ADR 0014 until an OpenAPI document exists.
2. **Envelopes in the web app.** The schemas of the HTTP envelopes (push, pull, trash) live in `apps/web/src/lib/http/schemas.ts`. The `data` of a mutation stays opaque to the route and is validated by the module that owns the entity.
3. **Limits at the boundary.** A push carries 1 to 100 mutations and the body is at most 1 MiB. Malformed input answers 400 `VALIDATION_FAILED`; an oversized body answers 413 `PAYLOAD_TOO_LARGE`.
4. **Deferred.** Generating the OpenAPI document from the schemas, and sharing the schemas with the browser client without importing module internals, are decided in their own ADR before the client is built. `P-006` stays open for those two points only.

## Considered options
- **Hand-written `openapi.yaml`.** Matches ADR 0014 literally, but duplicates the Zod schemas that already exist and drifts from them.
- **Generating the document now.** Adds a library and a build step before any client consumes it.

## Consequences
The routes can ship now with validated input. The cost is that for a while the contract is the spec text plus the schemas, not a machine-readable document; the client slice must close the two deferred points first.
