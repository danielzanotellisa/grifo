# 0007. PostgreSQL as the single datastore, including cache and queues

- Status: accepted (with a revisit trigger)
- Date: 2026-11-15

## Context
Load is low; most reads are served by the client's local store and immutable HTTP caching. A separate Redis is one more service to run, monitor and back up.

## Decision
One PostgreSQL instance holds: domain data (one schema per module); cache in `UNLOGGED` tables with `expires_at`; the job queue (`FOR UPDATE SKIP LOCKED`, through a library — see P-002); internal notifications with `LISTEN/NOTIFY`; sessions and rate limiting. Measure before adding any cache; HTTP caching comes first.

## Considered options
- Redis/Valkey for cache and queues: operational cost without proven need.

## Consequences
One backup, one service, and jobs created in the same transaction as the change that caused them. Revisit trigger: if cache or queue load competes with domain queries, write a new ADR for Redis/Valkey.
