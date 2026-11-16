import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

export type Db = NodePgDatabase<Record<string, never>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool);
}
