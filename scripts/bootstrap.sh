#!/usr/bin/env sh
# Installs dependencies at their current versions instead of hard-coding versions in this scaffold.
# Run once after cloning, then commit pnpm-lock.yaml. Check each license against ADR 0012 before adding more.
set -e

pnpm add -w -D typescript @types/node tsx vitest drizzle-kit

pnpm --filter @app/platform add drizzle-orm pg uuid
pnpm --filter @app/platform add -D @types/pg

for m in identity library annotation outline study export; do
  pnpm --filter "@app/$m" add drizzle-orm
done

pnpm --filter @app/outline add fractional-indexing

pnpm --filter @app/web add next react react-dom dexie
pnpm --filter @app/web add -D @types/react @types/react-dom

pnpm --filter @app/worker add pg graphile-worker

# .apkg generation (ADR 0027): SQLite in WASM + zip, both MIT.
pnpm --filter @app/export add sql.js fflate
pnpm --filter @app/export add -D @types/sql.js

# Deliberately NOT installed yet (open decisions in docs/pending):
#   PDF engine packages (EmbedPDF)      -> P-003 spike
#   auth library                        -> P-005
#   S3 SDK                              -> install @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner when implementing storage
