# 0005. Content-addressed object storage for PDFs

- Status: accepted
- Date: 2026-11-15
- Related: 0004, 0026

## Context
PDFs are large and immutable. Re-importing the same PDF should reuse its highlights.

## Decision
PDFs live in S3-compatible storage, keyed by owner and SHA-256 of the content. The browser uploads directly with a presigned URL; the server verifies size and hash before accepting. Deduplication applies only within one account.

## Considered options
- Store bytes in Postgres: size and backup cost.
- Cross-account dedup: would reveal who owns which file and mixes responsibility for copyrighted content.

## Consequences
Uploads bypass the API. Originals can be served with immutable HTTP caching. Account deletion must delete storage objects too.
