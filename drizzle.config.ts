import { defineConfig } from "drizzle-kit";

// One migration history for the whole monolith; each module owns its own schema (ADR 0002, 0023).
export default defineConfig({
  dialect: "postgresql",
  schema: ["./packages/platform/src/sync/schema.ts", "./packages/modules/*/src/infra/schema.ts"],
  out: "./db/migrations",
  schemaFilter: ["platform", "identity", "library", "annotation", "outline", "study", "export"],
  dbCredentials: { url: process.env.DATABASE_MIGRATOR_URL ?? "" },
});
