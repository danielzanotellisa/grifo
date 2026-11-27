/**
 * The settings of the end-to-end run, with the local defaults of `docker compose up -d` (the same
 * ones `scripts/db/global-setup.ts` uses). CI sets its own values and wins over these.
 */
export const E2E_PORT = 3100;

/**
 * Set to the address of a stack that is already running (`docker compose --profile app up -d`): the
 * tests then start no server and no worker and use that stack, as a person does (spec `_cross-cutting/local-run`).
 */
export const EXTERNAL_URL = process.env.E2E_BASE_URL;

const defaults: Record<string, string> = {
  DATABASE_MIGRATOR_URL: "postgres://postgres:postgres@localhost:5432/grifo",
  DATABASE_URL: "postgres://app_user:app_user@localhost:5432/grifo",
  DATABASE_AUTH_URL: "postgres://auth_user:auth_user@localhost:5432/grifo",
  S3_ENDPOINT: "http://localhost:8333",
  S3_PUBLIC_ENDPOINT: "http://localhost:8333",
  S3_ACCESS_KEY_ID: "devaccesskey",
  S3_SECRET_ACCESS_KEY: "devsecretkey",
  CLAMAV_HOST: "localhost",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  MAIL_FROM: "Grifo <no-reply@grifo.local>",
  APP_URL: EXTERNAL_URL ?? `http://localhost:${E2E_PORT}`,
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
};

export function applyDefaults(): void {
  for (const [name, value] of Object.entries(defaults)) process.env[name] ??= value;
}

export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";
