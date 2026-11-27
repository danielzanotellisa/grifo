import { describe, expect, it } from "vitest";
import type { Db } from "./db/client";
import { createPurge, type PurgeParticipant } from "./purge";

const db = {} as Db;
const DAY = 24 * 60 * 60 * 1000;

describe("createPurge", () => {
  it("[_cross-cutting/purge#AC-1] gives every participant the cutoff of 30 days before now", async () => {
    const cutoffs: Date[] = [];
    const participant: PurgeParticipant = {
      name: "a",
      purgeExpired: async (_db, cutoff) => void cutoffs.push(cutoff),
    };
    const now = new Date("2026-11-22T04:00:00Z");

    await createPurge([participant, { ...participant, name: "b" }]).run(db, now);

    expect(cutoffs).toEqual([
      new Date(now.getTime() - 30 * DAY),
      new Date(now.getTime() - 30 * DAY),
    ]);
  });

  it("[_cross-cutting/purge#AC-7] runs the others when one fails, then fails naming it", async () => {
    const ran: string[] = [];
    const ok = (name: string): PurgeParticipant => ({
      name,
      purgeExpired: async () => void ran.push(name),
    });
    const broken: PurgeParticipant = {
      name: "library",
      purgeExpired: async () => {
        throw new Error("storage down");
      },
    };

    const result = createPurge([ok("annotation"), broken, ok("study")]).run(db);

    await expect(result).rejects.toThrow("The purge failed in: library");
    expect(ran).toEqual(["annotation", "study"]);
  });
});
