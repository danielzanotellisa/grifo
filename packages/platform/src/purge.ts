import type { Db } from "./db/client";
import { TRASH_WINDOW_DAYS } from "./trash";

/**
 * What a module provides for the purge (ADR 0039). `purgeExpired` physically deletes the module's
 * rows whose `deleted_at` is before `cutoff`, across owners, on the admin connection. Registered
 * at the composition root of the worker, so the platform never imports a module.
 */
export type PurgeParticipant = {
  name: string;
  purgeExpired(db: Db, cutoff: Date): Promise<void>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function createPurge(participants: PurgeParticipant[]) {
  return {
    /**
     * Runs every participant, then fails if any failed, so the queue retries what is left. One
     * module's failure never stops the others (`_cross-cutting/purge`).
     */
    async run(db: Db, now: Date = new Date()): Promise<void> {
      const cutoff = new Date(now.getTime() - TRASH_WINDOW_DAYS * DAY_MS);
      const failures: { name: string; error: unknown }[] = [];
      for (const participant of participants) {
        try {
          await participant.purgeExpired(db, cutoff);
        } catch (error) {
          failures.push({ name: participant.name, error });
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((failure) => failure.error),
          `The purge failed in: ${failures.map((failure) => failure.name).join(", ")}`,
        );
      }
    },
  };
}
