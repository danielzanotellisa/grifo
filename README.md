# Grifo

Grifo: read PDFs, highlight, build structured summaries and flashcards. See `CLAUDE.md` for how the repo works and `docs/adr` for the decisions behind it.

## Run it (Docker only)

You only need Docker. From a clean clone, no setup:

```sh
docker compose --profile app up -d --build
```

Then open http://localhost:3000, create an account and use it. The first build takes a few minutes.

- **The confirmation email.** Signing up sends a link to confirm the address. There is no real mail: open **Mailpit** at http://localhost:8025 and click the link there.
- **The antivirus (ClamAV)** downloads its signatures the first time and takes a few minutes; until it is ready, imported PDFs are checked but not scanned for malware.
- **Your data** (accounts, PDFs, everything) lives in Docker volumes. `docker compose stop`, `down` and a restart keep it; **`docker compose down -v` erases it**.
- Stop it with `docker compose --profile app stop`, start it again with `docker compose --profile app up -d`.
- The settings have local defaults in `docker-compose.yml`. To change `APP_URL`, `BETTER_AUTH_SECRET` or `MAIL_FROM`, put them in a `.env` next to it. The default secret is for this machine only.

## Developing

```sh
cp .env.example .env
docker compose up -d          # only the infrastructure: Postgres, S3 (SeaweedFS), ClamAV, Mailpit, Gotenberg
./scripts/bootstrap.sh        # installs dependencies at current versions
pnpm db:setup                 # roles, migrations, job queue schema, RLS (idempotent)
pnpm dev                      # http://localhost:3000
pnpm e2e                      # browser tests (see apps/e2e/CLAUDE.md)
```

Mailpit UI: http://localhost:8025 · S3 endpoint: http://localhost:8333

## Contributing
Commits follow Conventional Commits (`feat(annotation): add highlight shortcut`); a husky hook rejects anything else. PRs use the template in `.github/` and must name the spec and ADR they implement. See "Commits and PRs" in `CLAUDE.md`.

## Docs
- `docs/adr` — architecture decisions (MADR)
- `docs/specs` — specs per entity + glossary
- `docs/pending` — known gaps and open decisions
- `docs/architecture` — C4 diagrams (Mermaid)
