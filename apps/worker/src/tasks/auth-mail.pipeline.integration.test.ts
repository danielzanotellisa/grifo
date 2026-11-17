import { createAuthDb, createMailOutbox } from "@app/identity";
import { createDb, enqueueJob, newId, withUser } from "@app/platform";
import { runOnce } from "graphile-worker";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupDatabase } from "../../../../scripts/db/setup";
import { createSendEmailTask } from "./auth-mail";

// `runOnce` drains the whole queue, and the route tests enqueue real jobs in parallel, so this test
// gets a database of its own. It also proves the schema, roles and policies work on a fresh database.
const PIPELINE_DATABASE = "grifo_pipeline_test";
const withDatabase = (url: string, name: string): string => {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
};
const migratorUrl = withDatabase(process.env.DATABASE_MIGRATOR_URL!, PIPELINE_DATABASE);
const appUrl = withDatabase(process.env.DATABASE_URL!, PIPELINE_DATABASE);
const authUrl = withDatabase(process.env.DATABASE_AUTH_URL!, PIPELINE_DATABASE);

const adminQuery = async (statement: string) => {
  const client = new pg.Client({
    connectionString: withDatabase(process.env.DATABASE_MIGRATOR_URL!, "postgres"),
  });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
};

const admin = new pg.Pool({ connectionString: migratorUrl, max: 1 });
const db = createDb(appUrl);
const outbox = createMailOutbox(createAuthDb(authUrl));

beforeAll(async () => {
  await adminQuery(`DROP DATABASE IF EXISTS ${PIPELINE_DATABASE} WITH (FORCE)`);
  await adminQuery(`CREATE DATABASE ${PIPELINE_DATABASE}`);
  await setupDatabase(migratorUrl);
});

// The database is recreated at the start of the next run, not dropped here: the pools of `createDb` and
// `createAuthDb` cannot be closed, and dropping a database under them raises an unhandled connection error.
afterAll(() => admin.end());

describe("the email pipeline", () => {
  it("[user/email#AC-7] is run by the worker with the application role: the message goes out and nothing is left", async () => {
    const owner = newId();
    const to = `pipeline-${owner}@example.com`;
    const url = "http://localhost:3000/api/auth/verify-email?token=abc";
    const mailId = await outbox.add({ to, kind: "verification", url });
    await withUser(db, owner, (tx) => enqueueJob(tx, "auth.sendEmail", { ownerId: owner, mailId }));
    const sent: { to: string; text: string }[] = [];
    const sendEmail = createSendEmailTask({
      outbox,
      from: "Grifo <no-reply@grifo.test>",
      transport: { sendMail: async (message) => void sent.push(message) },
    });

    await runOnce({
      connectionString: appUrl,
      taskList: { "auth.sendEmail": async (payload) => sendEmail(payload) },
      noHandleSignals: true,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to });
    expect(sent[0]!.text).toContain(url);
    expect(await outbox.get(mailId)).toBeUndefined();
    expect(
      (
        await admin.query(
          `select 1 from graphile_worker._private_jobs where payload->>'ownerId' = $1`,
          [owner],
        )
      ).rows,
    ).toEqual([]);
  });
});
