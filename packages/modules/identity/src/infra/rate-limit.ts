import { sql } from "drizzle-orm";
import type { AuthDb } from "./db";

/**
 * Counts one attempt of `key` in a window that starts at its first attempt, and says whether it is
 * allowed. One atomic upsert in `identity.rate_limits`, so concurrent attempts cannot all slip in.
 * For routes the authentication library does not serve; use a key outside its `ip|path` namespace.
 */
export async function consumeRateLimit(
  db: AuthDb,
  input: { key: string; max: number; windowSeconds: number; now?: Date },
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = (input.now ?? new Date()).getTime();
  const windowMs = input.windowSeconds * 1000;
  const expired = sql`identity.rate_limits.last_request <= ${now - windowMs}`;

  const { rows } = await db.execute(sql`
    insert into identity.rate_limits (key, count, last_request) values (${input.key}, 1, ${now})
    on conflict (key) do update set
      count = case when ${expired} then 1 else identity.rate_limits.count + 1 end,
      last_request = case when ${expired} then ${now} else identity.rate_limits.last_request end
    returning count, last_request`);
  const row = rows[0] as { count: number; last_request: string };

  return {
    allowed: row.count <= input.max,
    retryAfterSeconds: Math.max(1, Math.ceil((Number(row.last_request) + windowMs - now) / 1000)),
  };
}
