# Grifo

Grifo: read PDFs, highlight, build structured summaries and flashcards. See `CLAUDE.md` for how the repo works and `docs/adr` for the decisions behind it.

## First run

```sh
cp .env.example .env
docker compose up -d          # Postgres, S3 (SeaweedFS), ClamAV, Mailpit, Gotenberg
./scripts/bootstrap.sh        # installs dependencies at current versions
pnpm db:generate && pnpm db:migrate && pnpm db:queue && pnpm db:rls
pnpm dev                      # http://localhost:3000
```

Mailpit UI: http://localhost:8025 · S3 endpoint: http://localhost:8333

## Docs
- `docs/adr` — architecture decisions (MADR)
- `docs/specs` — specs per entity + glossary
- `docs/pending` — known gaps and open decisions
- `docs/architecture` — C4 diagrams (Mermaid)
