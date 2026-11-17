import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";

export type TaskName =
  | "document.validate"
  | "document.deepScan"
  | "export.render"
  | "trash.purge"
  | "backup.restoreTest"
  | "storage.integrityCheck"
  | "auth.sendEmail"
  | "auth.expireMail";

/** Every job payload carries its owner, so the worker can run it inside withUser (ADR 0016). */
export type JobPayload = { ownerId: string } & Record<string, unknown>;

/**
 * Enqueues a Graphile Worker job INSIDE the caller's transaction (ADR 0020, 0029):
 * if the transaction rolls back, the job never exists.
 * `jobKey` deduplicates: enqueueing the same key again replaces the pending job.
 * maxAttempts 4 = first run + 3 retries with Graphile's exponential backoff.
 */
export async function enqueueJob(
  tx: Tx,
  task: TaskName,
  payload: JobPayload,
  opts: { jobKey?: string; runAt?: Date } = {},
): Promise<void> {
  await tx.execute(sql`
    select graphile_worker.add_job(
      ${task},
      ${JSON.stringify(payload)}::json,
      run_at => ${opts.runAt ?? null}::timestamptz,
      max_attempts => 4,
      job_key => ${opts.jobKey ?? null}
    )
  `);
}
