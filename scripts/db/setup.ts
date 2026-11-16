import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations } from "graphile-worker";
import pg from "pg";

const root = fileURLToPath(new URL("../..", import.meta.url));

export async function runSqlFile(migratorUrl: string, name: string): Promise<void> {
  const script = await readFile(join(root, "db/sql", name), "utf8");
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query(script);
  } finally {
    await client.end();
  }
}

/** Roles, schema migrations, the job queue schema, then RLS and grants. Safe to run repeatedly. */
export async function setupDatabase(migratorUrl: string): Promise<void> {
  await runSqlFile(migratorUrl, "roles.sql");

  const pool = new pg.Pool({ connectionString: migratorUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(root, "db/migrations") });
  } finally {
    await pool.end();
  }

  await runMigrations({ connectionString: migratorUrl });
  await runSqlFile(migratorUrl, "rls.sql");
}
