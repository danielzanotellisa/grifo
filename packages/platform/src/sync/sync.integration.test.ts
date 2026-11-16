import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { withUser } from "../db/with-user";
import { DomainError } from "../errors";
import { newId } from "../ids";
import { createSyncEngine, type SyncChange, type SyncHandler } from "./engine";
import { recordChange, type SyncEntity } from "./record-change";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

beforeAll(async () => {
  await admin.query(`
    create table if not exists test_support.items (
      id uuid primary key,
      owner_id uuid not null,
      entity text not null,
      text text not null,
      deleted_at timestamptz
    );
  `);
});

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

type Tx = Parameters<Parameters<typeof withUser>[2]>[0];

/** Test double of a module handler: stores items in a table and can reject, fail or cascade on demand. */
function itemHandler(entity: SyncEntity): SyncHandler {
  return {
    entity,
    async apply(tx, ownerId, { op, data }) {
      const { id, text = "" } = data as { id: string; text?: string };
      if (op === "delete") {
        await tx.execute(
          sql`update test_support.items set deleted_at = now() where id = ${id} and owner_id = ${ownerId}`,
        );
        return [{ entity, entityId: id, op: "delete" }];
      }
      await tx.execute(sql`
        insert into test_support.items (id, owner_id, entity, text) values (${id}, ${ownerId}, ${entity}, ${text})
        on conflict (id) do update set text = excluded.text, deleted_at = null`);
      if (text === "reject") throw new DomainError("PARENT_DELETED", "The parent was deleted", 422);
      if (text === "boom") throw new Error("handler bug");
      const changes: SyncChange[] = [{ entity, entityId: id, op: "upsert" }];
      if (text === "with-child") {
        const childId = id.replace(/.$/, "f");
        await tx.execute(sql`
          insert into test_support.items (id, owner_id, entity, text) values (${childId}, ${ownerId}, 'flashcard', 'child')
          on conflict (id) do nothing`);
        changes.push({ entity: "flashcard", entityId: childId, op: "upsert" });
      }
      return changes;
    },
    async read(tx, ownerId, ids) {
      const { rows } = await tx.execute(
        sql`select id, text from test_support.items
             where owner_id = ${ownerId} and entity = ${entity} and deleted_at is null
               and id = any(${sql.raw(`array[${ids.map((i) => `'${i}'`).join(",")}]::uuid[]`)})`,
      );
      return new Map((rows as { id: string; text: string }[]).map((r) => [r.id, { text: r.text }]));
    },
  };
}

const engine = createSyncEngine([itemHandler("highlight"), itemHandler("flashcard")]);

const upsert = (text = "x", id = newId()) => ({
  mutationId: newId(),
  entity: "highlight",
  op: "upsert" as const,
  data: { id, text },
});

const itemCount = (ownerId: string) =>
  withUser(db, ownerId, async (tx) => {
    const { rows } = await tx.execute(
      sql`select count(*)::int as n from test_support.items where owner_id = ${ownerId}`,
    );
    return (rows[0] as { n: number }).n;
  });

const record = (tx: Tx, ownerId: string, entityId: string, op: "upsert" | "delete" = "upsert") =>
  recordChange(tx, { ownerId, entity: "highlight", entityId, op });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("push", () => {
  it("[_cross-cutting/sync#AC-1] applies each mutation of a resent batch once", async () => {
    const owner = newId();
    const batch = Array.from({ length: 10 }, () => upsert());

    await engine.push(db, owner, batch);
    await engine.push(db, owner, batch);

    expect(await itemCount(owner)).toBe(10);
  });

  it("[_cross-cutting/sync#AC-2] answers duplicate and changes nothing on the second push", async () => {
    const owner = newId();
    const batch = [upsert(), upsert()];

    const first = await engine.push(db, owner, batch);
    const second = await engine.push(db, owner, batch);

    expect(first.results.map((r) => r.status)).toEqual(["applied", "applied"]);
    expect(second.results.map((r) => r.status)).toEqual(["duplicate", "duplicate"]);
    expect(second.cursor).toBe(first.cursor);
  });

  it("[_cross-cutting/sync#AC-5] applies a batch in order and keeps going after a rejection", async () => {
    const owner = newId();
    const [first, bad, last] = [upsert("one"), upsert("reject"), upsert("three")];

    const { results } = await engine.push(db, owner, [first, bad, last]);
    const pulled = await engine.pull(db, owner, 0);

    expect(results.map((r) => r.status)).toEqual(["applied", "rejected", "applied"]);
    expect(pulled.changes.map((c) => c.entityId)).toEqual([first.data.id, last.data.id]);
  });

  it("[_cross-cutting/sync#AC-6] rejects with the error code, persists nothing and repeats the rejection", async () => {
    const owner = newId();
    const bad = upsert("reject");

    const first = await engine.push(db, owner, [bad]);
    const again = await engine.push(db, owner, [bad]);

    expect(first.results).toEqual([
      { mutationId: bad.mutationId, status: "rejected", code: "PARENT_DELETED" },
    ]);
    expect(again.results).toEqual(first.results);
    expect(await itemCount(owner)).toBe(0);
  });

  it("[_cross-cutting/sync#AC-11] rejects a mutation for an entity without a handler", async () => {
    const owner = newId();
    const orphan = { ...upsert(), entity: "export" };

    const { results } = await engine.push(db, owner, [orphan]);

    expect(results).toEqual([
      { mutationId: orphan.mutationId, status: "rejected", code: "SYNC_ENTITY_UNKNOWN" },
    ]);
  });

  it("[_cross-cutting/sync#AC-12] treats the same mutationId of two owners independently", async () => {
    const [alice, bob] = [newId(), newId()];
    const shared = newId();
    const mutation = (id: string) => ({ ...upsert("x", id), mutationId: shared });
    const [aliceItem, bobItem] = [newId(), newId()];

    const a = await engine.push(db, alice, [mutation(aliceItem)]);
    const b = await engine.push(db, bob, [mutation(bobItem)]);

    expect(a.results[0]?.status).toBe("applied");
    expect(b.results[0]?.status).toBe("applied");
    expect((await engine.pull(db, alice, 0)).changes.map((c) => c.entityId)).toEqual([aliceItem]);
    expect((await engine.pull(db, bob, 0)).changes.map((c) => c.entityId)).toEqual([bobItem]);
  });

  it("lets an unexpected handler failure bubble up and leaves the mutation unrecorded", async () => {
    const owner = newId();
    const boom = upsert("boom");

    await expect(engine.push(db, owner, [boom])).rejects.toThrow("handler bug");

    expect(await itemCount(owner)).toBe(0);
    expect((await engine.pull(db, owner, 0)).changes).toEqual([]);
  });
});

describe("pull", () => {
  it("[_cross-cutting/sync#AC-7] delivers each entity once with its latest state", async () => {
    const owner = newId();
    const id = newId();

    await engine.push(db, owner, [upsert("v1", id)]);
    await engine.push(db, owner, [upsert("v2", id)]);
    const last = await engine.push(db, owner, [upsert("v3", id)]);
    const pulled = await engine.pull(db, owner, 0);

    expect(pulled.changes).toEqual([
      { entity: "highlight", entityId: id, op: "upsert", data: { text: "v3" } },
    ]);
    expect(pulled.cursor).toBe(last.cursor);
    expect(pulled.more).toBe(false);
  });

  it("[_cross-cutting/sync#AC-8] pages through more than 500 changes without gaps or repeats", async () => {
    const owner = newId();
    const ids = Array.from({ length: 1201 }, () => newId());
    await withUser(db, owner, async (tx) => {
      for (const id of ids) await record(tx, owner, id, "delete");
    });

    const received: string[] = [];
    const sizes: number[] = [];
    const flags: boolean[] = [];
    let cursor = 0;
    for (;;) {
      const page = await engine.pull(db, owner, cursor);
      received.push(...page.changes.map((c) => c.entityId));
      sizes.push(page.changes.length);
      flags.push(page.more);
      cursor = page.cursor;
      if (!page.more) break;
    }

    expect(sizes).toEqual([500, 500, 201]);
    expect(flags).toEqual([true, true, false]);
    expect(received).toEqual(ids);
  });

  it("[_cross-cutting/sync#AC-9][_cross-cutting/soft-delete#AC-6] delivers a tombstone for a deleted entity, without row content", async () => {
    const owner = newId();
    const id = newId();

    await engine.push(db, owner, [upsert("x", id)]);
    await engine.push(db, owner, [{ ...upsert("x", id), op: "delete" }]);
    const { changes } = await engine.pull(db, owner, 0);

    expect(changes).toEqual([{ entity: "highlight", entityId: id, op: "delete" }]);
    expect(changes[0]).not.toHaveProperty("data");
  });

  it("[_cross-cutting/sync#AC-9] delivers a tombstone when the upserted entity is no longer live", async () => {
    const owner = newId();
    const id = newId();

    await engine.push(db, owner, [upsert("x", id)]);
    await admin.query(`update test_support.items set deleted_at = now() where id = $1`, [id]);
    const { changes } = await engine.pull(db, owner, 0);

    expect(changes).toEqual([{ entity: "highlight", entityId: id, op: "delete" }]);
  });

  it("[_cross-cutting/sync#AC-10] delivers an entity and its cascaded child together", async () => {
    const owner = newId();
    const parent = upsert("with-child", "00000000-0000-7000-8000-00000000000a");

    await engine.push(db, owner, [parent]);
    const { changes } = await engine.pull(db, owner, 0);

    expect(changes.map((c) => `${c.entity}:${c.entityId}`)).toEqual([
      "highlight:00000000-0000-7000-8000-00000000000a",
      "flashcard:00000000-0000-7000-8000-00000000000f",
    ]);
  });

  it("[_cross-cutting/sync#AC-4] never skips a change that commits after a later pull cursor", async () => {
    const owner = newId();
    const [first, second] = [newId(), newId()];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let recorded!: () => void;
    const firstRecorded = new Promise<void>((resolve) => (recorded = resolve));

    const t1 = withUser(db, owner, async (tx) => {
      await record(tx, owner, first);
      recorded();
      await held;
    });
    await firstRecorded;
    const t2 = withUser(db, owner, (tx) => record(tx, owner, second));
    const t2State = await Promise.race([
      t2.then(() => "committed"),
      sleep(300).then(() => "waiting"),
    ]);
    const between = await engine.pull(db, owner, 0);

    release();
    await Promise.all([t1, t2]);
    const after = await engine.pull(db, owner, between.cursor);

    expect(t2State).toBe("waiting");
    expect([...between.changes, ...after.changes].map((c) => c.entityId)).toEqual([first, second]);
  });
});
