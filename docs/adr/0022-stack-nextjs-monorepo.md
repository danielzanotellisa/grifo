# 0022. Stack: TypeScript monorepo, Next.js for UI and HTTP, separate worker

- Status: accepted
- Date: 2026-11-15
- Related: 0002, 0019

## Context
The developer chose Next.js (TypeScript) for the backend and React for the frontend, in one monorepo. Next.js already is a React framework, so one app can serve both. The architecture needs long-lived processes (SSE, LISTEN/NOTIFY, a job worker) and module boundaries independent of the web framework.

## Decision
- pnpm workspaces monorepo, TypeScript everywhere.
- `apps/web`: one Next.js app (App Router) serving the React UI and the HTTP API as Route Handlers. Route Handlers are thin adapters. Server Actions are not used for domain mutations: all mutations go through the sync push endpoint so the API contract stays explicit.
- `packages/modules/*`: framework-agnostic domain modules; Next.js and the worker both consume them.
- `apps/worker`: plain Node process for jobs.
- Self-hosted Node runtime (`output: "standalone"` in a container). Not deployed to serverless platforms.

## Considered options
- Vite SPA + separate API framework (Fastify/NestJS): cleaner split, but two frameworks and two deploys for one developer.
- Next.js with Server Actions as the API: RPC tied to React, no explicit contract for the sync protocol.

## Consequences
One web deploy plus one worker. Domain code never imports from `next`. The reader is a client component tree; the local-first store and outbox run in the browser.
