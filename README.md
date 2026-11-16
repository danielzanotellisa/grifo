# Grifo

Grifo: read PDFs, highlight, build structured summaries and flashcards. See `CLAUDE.md` for how the repo works and `docs/adr` for the decisions behind it.

## First run

```sh
cp .env.example .env
docker compose up -d          # Postgres, S3 (SeaweedFS), ClamAV, Mailpit, Gotenberg
./scripts/bootstrap.sh        # installs dependencies at current versions
pnpm db:setup                 # roles, migrations, job queue schema, RLS (idempotent)
pnpm dev                      # http://localhost:3000
```

Mailpit UI: http://localhost:8025 · S3 endpoint: http://localhost:8333

## Contributing
Commits follow Conventional Commits (`feat(annotation): add highlight shortcut`); a husky hook rejects anything else. PRs use the template in `.github/` and must name the spec and ADR they implement. See "Commits and PRs" in `CLAUDE.md`.

## Docs
- `docs/adr` — architecture decisions (MADR)
- `docs/specs` — specs per entity + glossary
- `docs/pending` — known gaps and open decisions
- `docs/architecture` — C4 diagrams (Mermaid)
