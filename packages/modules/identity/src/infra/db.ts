import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

export type AuthDb = NodePgDatabase;

/**
 * The pool of the authentication role (`DATABASE_AUTH_URL`). Built here, not in the platform: the
 * authentication library pulls its own copy of drizzle-orm, and the types of the two are not
 * interchangeable.
 */
export function createAuthDb(connectionString: string): AuthDb {
  return drizzle(new pg.Pool({ connectionString }));
}
