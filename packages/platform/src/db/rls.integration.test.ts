import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { newId } from "../ids";
import { recordChange } from "../sync/record-change";
import type { Db } from "./client";
import { withUser } from "./with-user";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db: Db = drizzle(appPool);
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const SCHEMAS = ["platform", "identity", "library", "annotation", "outline", "study", "export"];

const changeCount = (tx: Parameters<Parameters<typeof withUser>[2]>[0]) =>
  tx
    .execute(sql`select count(*)::int as n from platform.change_log`)
    .then((r) => (r.rows[0] as { n: number }).n);

const record = (tx: Parameters<Parameters<typeof withUser>[2]>[0], ownerId: string) =>
  recordChange(tx, { ownerId, entity: "subject", entityId: newId(), op: "upsert" });

describe("row level security", () => {
  it("is enabled, forced and backed by a policy on every owned table", async () => {
    const { rows } = await admin.query<{
      table: string;
      enabled: boolean;
      forced: boolean;
      policies: number;
    }>(
      `select n.nspname || '.' || c.relname as "table", c.relrowsecurity as enabled,
              c.relforcerowsecurity as forced,
              (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname = any($1)
          and (c.relname = 'users' and n.nspname = 'identity'
               or exists (select 1 from pg_attribute a
                           where a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped))
        order by 1`,
      [SCHEMAS],
    );

    expect(rows.length).toBeGreaterThanOrEqual(10);
    const unprotected = rows.filter((r) => !r.enabled || !r.forced || r.policies < 1);
    expect(unprotected.map((r) => r.table)).toEqual([]);
  });

  it("leaves no table of the module schemas without it", async () => {
    const { rows } = await admin.query<{ table: string }>(
      `select n.nspname || '.' || c.relname as "table"
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname = any($1) and not c.relrowsecurity
        order by 1`,
      [SCHEMAS],
    );

    expect(rows.map((r) => r.table)).toEqual([]);
  });

  it("connects as a role that cannot bypass it", async () => {
    const { rows } = await db.execute(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );

    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("shows each user only their own rows", async () => {
    const alice = newId();
    const bob = newId();

    await withUser(db, alice, (tx) => record(tx, alice));
    await withUser(db, alice, (tx) => record(tx, alice));
    await withUser(db, bob, (tx) => record(tx, bob));

    expect(await withUser(db, alice, changeCount)).toBe(2);
    expect(await withUser(db, bob, changeCount)).toBe(1);
  });

  it("rejects writing a row that belongs to someone else", async () => {
    const alice = newId();
    const bob = newId();

    await expect(withUser(db, bob, (tx) => record(tx, alice))).rejects.toThrow();
    expect(await withUser(db, alice, changeCount)).toBe(0);
  });

  it("shows nothing when no user is set", async () => {
    const alice = newId();
    await withUser(db, alice, (tx) => record(tx, alice));

    const { rows } = await db.execute(sql`select count(*)::int as n from platform.change_log`);

    expect(rows[0]).toEqual({ n: 0 });
  });
});
