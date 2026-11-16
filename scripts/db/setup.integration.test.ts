import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupDatabase } from "./setup";

const SCRATCH_DATABASE = "grifo_setup_test";

const withDatabase = (url: string, name: string): string => {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
};

const adminUrl = withDatabase(process.env.DATABASE_MIGRATOR_URL!, "postgres");
const scratchUrl = withDatabase(process.env.DATABASE_MIGRATOR_URL!, SCRATCH_DATABASE);

const adminQuery = async (statement: string) => {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
};

// The setup runs DDL that takes exclusive locks, so it gets a database of its own instead of
// the one the other integration tests are using in parallel.
beforeAll(() =>
  adminQuery(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE)`).then(() =>
    adminQuery(`CREATE DATABASE ${SCRATCH_DATABASE}`),
  ),
);
afterAll(() => adminQuery(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE)`));

describe("setupDatabase", () => {
  it("sets up an empty database and can run again on it", async () => {
    await setupDatabase(scratchUrl);

    await expect(setupDatabase(scratchUrl)).resolves.toBeUndefined();
  });
});
