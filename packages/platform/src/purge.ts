import { inArray } from "drizzle-orm";
import type { Db } from "./db/client";
import { changeLog, processedMutations } from "./sync/schema";
import { TRASH_WINDOW_DAYS } from "./trash";

/**
 * What a module provides for the purge (ADR 0039). `purgeExpired` physically deletes the module's
 * rows whose `deleted_at` is before `cutoff`, across owners, on the admin connection. Registered
 * at the composition root of the worker, so the platform never imports a module.
 */
export type PurgeParticipant = {
  name: string;
  purgeExpired(db: Db, cutoff: Date): Promise<void>;
  /** Deletes everything the module holds for these owners, objects first (`user/purge`). */
  purgeOwners?(db: Db, ownerIds: string[]): Promise<void>;
};

/**
 * The deleted accounts whose window is over, and the removal of their identity once every module
 * has purged their data. Provided by the composition root of the worker (`user/purge`).
 */
export type AccountPurge = {
  expired(db: Db, cutoff: Date): Promise<string[]>;
  remove(db: Db, ownerIds: string[]): Promise<void>;
};

/** The change log and the processed mutations belong to no module: the platform purges them with an account. */
export const platformPurgeParticipant: PurgeParticipant = {
  name: "platform",
  async purgeExpired() {},
  async purgeOwners(db, ownerIds) {
    await db.delete(changeLog).where(inArray(changeLog.ownerId, ownerIds));
    await db.delete(processedMutations).where(inArray(processedMutations.ownerId, ownerIds));
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function createPurge(participants: PurgeParticipant[], accounts?: AccountPurge) {
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
      if (accounts) {
        const owners = await accounts.expired(db, cutoff);
        if (owners.length > 0) {
          const before = failures.length;
          for (const participant of participants) {
            try {
              await participant.purgeOwners?.(db, owners);
            } catch (error) {
              failures.push({ name: participant.name, error });
            }
          }
          // The identity goes last, and only when no module failed: otherwise the account must be found again.
          if (failures.length === before) {
            try {
              await accounts.remove(db, owners);
            } catch (error) {
              failures.push({ name: "identity", error });
            }
          }
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
