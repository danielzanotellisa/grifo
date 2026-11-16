# Architecture Decision Records

MADR-style, one decision per file, immutable once accepted (see 0021). Template: `template.md`.

| # | Decision | Status |
| --- | --- | --- |
| 0001 | Desktop web platform | accepted |
| 0002 | Modular monolith backend with a client-side app | accepted |
| 0003 | Own backend instead of a BaaS | accepted |
| 0004 | Highlights as data; the original PDF is immutable | accepted |
| 0005 | Content-addressed object storage for PDFs | accepted |
| 0006 | Local-first client with an outbox | accepted |
| 0007 | PostgreSQL as the single datastore | accepted |
| 0008 | User-defined highlight categories | accepted, amended by 0013 |
| 0009 | The summary is an outline tree | accepted, amended by 0013 |
| 0010 | Flashcard export as .apkg | superseded by 0025 |
| 0011 | Sharing covers generated summaries only | accepted |
| 0012 | Permissive dependencies only | accepted |
| 0013 | Domain model and ubiquitous language | accepted |
| 0014 | Quality attributes and scenarios | accepted |
| 0015 | Sync protocol: push/pull + SSE | accepted |
| 0016 | Owner-based authorization with RLS | accepted |
| 0017 | PDF validation and scanning on upload | accepted |
| 0018 | Durability: backups, PITR, trash | accepted |
| 0019 | Local environment, entitlements | accepted, amended by 0026 |
| 0020 | Asynchronous exports | accepted |
| 0021 | Documentation in the repository | accepted |
| 0022 | Stack: Next.js monorepo + worker | accepted |
| 0023 | Drizzle ORM, schema per module | accepted |
| 0024 | PDF engine: EmbedPDF behind a port | accepted (spike P-003) |
| 0025 | Flashcard export as CSV first | superseded by 0027 |
| 0026 | Local S3: SeaweedFS | accepted |
| 0027 | Flashcard export as .apkg (own generator) | accepted |
| 0028 | Summary rendering with Gotenberg | accepted |
| 0029 | Job queue: Graphile Worker | accepted |
| 0030 | Traceability between specs, code, commits and PRs | accepted |
| 0031 | Repository workflow: PR-only main, worktrees, lint and format | accepted |
