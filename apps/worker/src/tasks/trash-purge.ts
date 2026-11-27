import type { Db, createPurge } from "@app/platform";

/**
 * `trash.purge`: the daily physical deletion of what has been in the trash for more than 30 days
 * (`docs/specs/_cross-cutting/purge`). It runs on the admin connection because it works across
 * owners; it takes no payload.
 */
export function createPurgeTask(deps: { db: Db; purge: ReturnType<typeof createPurge> }) {
  return async (): Promise<void> => {
    await deps.purge.run(deps.db);
  };
}
