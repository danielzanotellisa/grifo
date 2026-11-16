# Starting point; a compiled production build is tracked in docs/pending/P-010.
FROM node:24-alpine
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@app/worker", "start"]
