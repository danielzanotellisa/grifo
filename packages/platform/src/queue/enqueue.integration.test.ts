import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { withUser } from "../db/with-user";
import { newId } from "../ids";
import { enqueueJob } from "./enqueue";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const jobsFor = async (ownerId: string) =>
  (
    await admin.query<{
      task_identifier: string;
      payload: Record<string, unknown>;
      max_attempts: number;
      key: string | null;
    }>(
      `select t.identifier as task_identifier, j.payload, j.max_attempts, j.key from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id where j.payload->>'ownerId' = $1`,
      [ownerId],
    )
  ).rows;

describe("enqueueJob", () => {
  it("lets the application role enqueue a job with up to 4 attempts", async () => {
    const owner = newId();

    await withUser(db, owner, (tx) => enqueueJob(tx, "storage.integrityCheck", { ownerId: owner }));

    const jobs = await jobsFor(owner);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ task_identifier: "storage.integrityCheck", max_attempts: 4 });
  });

  it("leaves no job behind when the transaction rolls back (ADR 0020)", async () => {
    const owner = newId();

    await expect(
      withUser(db, owner, async (tx) => {
        await enqueueJob(tx, "storage.integrityCheck", { ownerId: owner });
        throw new Error("the write failed");
      }),
    ).rejects.toThrow("the write failed");

    expect(await jobsFor(owner)).toEqual([]);
  });

  it("replaces a pending job that has the same key", async () => {
    const owner = newId();
    const jobKey = `test-${owner}`;

    await withUser(db, owner, (tx) =>
      enqueueJob(tx, "storage.integrityCheck", { ownerId: owner, n: 1 }, { jobKey }),
    );
    await withUser(db, owner, (tx) =>
      enqueueJob(tx, "storage.integrityCheck", { ownerId: owner, n: 2 }, { jobKey }),
    );

    const jobs = await jobsFor(owner);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload.n).toBe(2);
  });
});
