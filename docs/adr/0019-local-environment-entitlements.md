# 0019. Local Docker Compose environment, no limits, single entitlements point

- Status: accepted, amended by 0026
- Date: 2026-11-15

## Context
First goal: run the whole system locally in containers, shaped like production. Plans and limits are out of scope now but may come.

## Decision
`docker-compose.yml` runs postgres, s3 (see 0026), clamav and mailpit by default; `web` and `worker` under the `app` profile. Configuration only via environment variables; same images as production.

No product limits. Every "may this user do X?" check still goes through one `EntitlementPolicy`, which currently allows everything. Checks use capability names (`export.summaryPdf`, `upload.maxFileSizeBytes`), never plan names. Technical safety ceilings (e.g. 500 MB upload, concurrent jobs) are configuration, not entitlements.

## Considered options
- Services installed on the host: does not reproduce the real environment.
- Modeling plans now: speculative.

## Consequences
The environment needs ~3–4 GB of free RAM (mostly ClamAV). Plans later mean a Billing module feeding `EntitlementPolicy`, recorded in a new ADR.
