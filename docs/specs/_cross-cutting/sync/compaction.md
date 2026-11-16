# Change log compaction — spec

- Status: draft
- Modules: platform, worker
- ADRs: 0015, 0018

## Definition
The change log cannot grow forever. Changes older than a horizon are compacted, and a client whose cursor predates the horizon reloads its data instead of pulling.

## Rules
1. Cursors older than the compaction horizon get `reset: true` from pull; the client reloads that user's data.
2. Compaction is a worker job; `app_user` must not need DELETE on `platform.change_log` for it.

## Acceptance criteria
- [ ] **AC-1** Given a cursor older than the horizon, when a client pulls, then the response has `reset: true` and no changes.

## Open questions
- Horizon length (for example 90 days) and the client reset flow: `docs/pending/P-007` point 1.
