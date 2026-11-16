import pg from "pg";
import { setupDatabase } from "./setup";

const TEST_DATABASE = "grifo_test";

const withDatabase = (url: string, name: string): string => {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
};

/** Recreates a dedicated database so every run starts from the committed migrations. */
export default async function setup(): Promise<void> {
  const migratorUrl =
    process.env.DATABASE_MIGRATOR_URL ?? "postgres://postgres:postgres@localhost:5432/grifo";
  const appUrl = process.env.DATABASE_URL ?? "postgres://app_user:app_user@localhost:5432/grifo";

  const admin = new pg.Client({ connectionString: withDatabase(migratorUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
  } finally {
    await admin.end();
  }

  process.env.DATABASE_MIGRATOR_URL = withDatabase(migratorUrl, TEST_DATABASE);
  process.env.DATABASE_URL = withDatabase(appUrl, TEST_DATABASE);
  await setupDatabase(process.env.DATABASE_MIGRATOR_URL);
}
