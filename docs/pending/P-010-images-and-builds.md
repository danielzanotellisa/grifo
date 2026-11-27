# P-010. Image pinning and production worker build

- Status: open
- Blocks: anything beyond local development
- Related: ADR 0019, 0026

## Done for the local run
The images build and run with `docker compose --profile app up -d --build`: the Next standalone output works inside the pnpm monorepo (point 3) and a `.dockerignore` keeps the host's binaries out. Points 1 and 2 stay open for a deploy outside this machine.

## Open points
1. `docker-compose.yml` and Dockerfiles use loose tags (`latest`, major versions). Pin by digest and update deliberately.
2. The worker runs TypeScript through `tsx`; production should run a compiled build.
3. Next.js standalone output inside a pnpm monorepo: confirm the traced files include workspace packages.

## How to close
Fix the three points before the first non-local deploy.
