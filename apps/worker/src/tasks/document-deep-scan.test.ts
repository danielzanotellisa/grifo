import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDeepScanTask } from "./document-deep-scan";

const helpers = (attempts: number) => ({ job: { attempts, max_attempts: 4 } }) as never;

describe("document.deepScan task", () => {
  it("passes the ids and whether it is the last attempt", async () => {
    const calls: unknown[][] = [];
    const task = createDeepScanTask({
      scan: { run: async (...args: unknown[]) => void calls.push(args) } as never,
    });
    const payload = { ownerId: randomUUID(), documentId: randomUUID() };

    await task(payload, helpers(2));
    await task(payload, helpers(4));

    expect(calls).toEqual([
      [payload.ownerId, payload.documentId, { lastAttempt: false }],
      [payload.ownerId, payload.documentId, { lastAttempt: true }],
    ]);
  });

  it("refuses a payload that is not made of ids", async () => {
    const task = createDeepScanTask({ scan: { run: async () => undefined } as never });

    await expect(task({ ownerId: "x", documentId: "y" }, helpers(1))).rejects.toThrow();
  });
});
