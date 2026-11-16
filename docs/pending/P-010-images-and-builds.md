# P-010. Image pinning and production worker build

- Status: open
- Blocks: anything beyond local development
- Related: ADR 0019, 0026

## Open points
1. `docker-compose.yml` and Dockerfiles use loose tags (`latest`, major versions). Pin by digest and update deliberately.
2. The worker runs TypeScript through `tsx`; production should run a compiled build.
3. Next.js standalone output inside a pnpm monorepo: confirm the traced files include workspace packages.

## How to close
Fix the three points before the first non-local deploy.
