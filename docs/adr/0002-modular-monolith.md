# 0002. Modular monolith backend with a client-side app

- Status: accepted
- Date: 2026-11-15
- Related: 0022, 0023

## Context
One developer, a well-bounded domain, low load per user. Microservices add distributed deploys, network calls and eventual consistency for no gain at this scale.

## Decision
One deployable backend split into domain modules: identity, library, annotation, outline, study, export. Each module owns one Postgres schema and exposes a public API from its package root. No module reads another module's tables, joins across schemas, or imports another module's internals. A worker process runs from the same code with a different entry point.

## Considered options
- Microservices: operational cost.
- Monolith without boundaries: hard to evolve or split later.

## Consequences
One deploy, one database, simple debugging. Boundaries must be guarded (lint rule or architecture test in CI). A module that needs to scale alone can be extracted.
