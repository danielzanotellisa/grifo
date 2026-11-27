import { defineConfig } from "@playwright/test";
import { applyDefaults, E2E_PORT } from "./src/env";

applyDefaults();

/**
 * Drives a real browser through the app: a production build of the web app, the worker, Postgres,
 * the S3-compatible storage and Mailpit. `docker compose up -d` provides the last three locally.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./src/global-setup.ts",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `pnpm --filter @app/web build && pnpm --filter @app/web exec next start -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
