import { newId } from "@app/platform";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createAuthDb } from "./db";
import { createMailOutbox } from "./mail-outbox";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const outbox = createMailOutbox(createAuthDb(process.env.DATABASE_AUTH_URL!));

afterAll(async () => {
  await Promise.all([admin.end(), appPool.end()]);
});

const address = () => `mail-${newId()}@example.com`;
const link = "http://localhost:3000/api/auth/verify-email?token=segredo";

describe("the mail outbox", () => {
  it("stores a message, gives it back by id and removes it", async () => {
    const to = address();

    const id = await outbox.add({ to, kind: "verification", url: link });

    expect(await outbox.get(id)).toEqual({ to, kind: "verification", url: link });
    await outbox.remove(id);
    expect(await outbox.get(id)).toBeUndefined();
    await expect(outbox.remove(id)).resolves.toBeUndefined();
  });

  it("[user/email#AC-5] expires only the messages older than the given moment", async () => {
    const [oldId, freshId] = [
      await outbox.add({ to: address(), kind: "reset", url: link }),
      await outbox.add({ to: address(), kind: "reset", url: link }),
    ];
    await admin.query(
      `update identity.outgoing_mail set created_at = now() - interval '25 hours' where id = $1`,
      [oldId],
    );

    const removed = await outbox.expireOlderThan(new Date(Date.now() - 24 * 60 * 60 * 1000));

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await outbox.get(oldId)).toBeUndefined();
    expect(await outbox.get(freshId)).toBeDefined();
  });

  it("[user/email#AC-6] cannot be read by the application role", async () => {
    await outbox.add({ to: address(), kind: "verification", url: link });

    await expect(appPool.query(`select * from identity.outgoing_mail`)).rejects.toThrow(
      /permission denied/i,
    );
  });
});
