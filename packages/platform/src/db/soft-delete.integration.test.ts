import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgSchema, text, uuid } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { newId } from "../ids";
import type { SyncChange } from "../sync/engine";
import { createTrash, type TrashParticipant } from "../trash";
import type { Db } from "./client";
import { ownedColumns } from "./columns";
import { liveOnly, restoreByRoot, softDelete, softDeleteWhere } from "./soft-delete";
import { withUser } from "./with-user";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

const testSupport = pgSchema("test_support");
const subjects = testSupport.table("td_subjects", {
  ...ownedColumns(),
  name: text("name").notNull(),
});
const documents = testSupport.table("td_documents", {
  ...ownedColumns(),
  subjectId: uuid("subject_id").notNull(),
  title: text("title").notNull(),
});

const COLUMNS = `
  id uuid primary key, owner_id uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, deleted_root_id uuid`;

beforeAll(async () => {
  await admin.query(`
    create table if not exists test_support.td_subjects (${COLUMNS}, name text not null);
    create table if not exists test_support.td_documents (${COLUMNS}, subject_id uuid not null, title text not null);
  `);
});

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

type Tx = Parameters<Parameters<typeof withUser>[2]>[0];

const NOW = new Date("2026-03-01T00:00:00Z");
const upsert = (entity: "subject" | "document", id: string): SyncChange => ({
  entity,
  entityId: id,
  op: "upsert",
});

/** Test double of the modules: a parent table and a child table with the cascade and the restore rules. */
const subjectParticipant: TrashParticipant = {
  entity: "subject",
  async list(tx, ownerId) {
    const rows = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.ownerId, ownerId), eq(subjects.deletedRootId, subjects.id)));
    return rows.map((r) => ({
      entity: "subject",
      id: r.id,
      label: r.name,
      deletedAt: r.deletedAt!,
    }));
  },
  async restore(tx, ownerId, rootId, now) {
    const ids = await restoreByRoot(tx, subjects, { ownerId, rootId, now });
    return ids.map((id) => upsert("subject", id));
  },
};

const documentParticipant: TrashParticipant = {
  entity: "document",
  async list(tx, ownerId) {
    const rows = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.ownerId, ownerId), eq(documents.deletedRootId, documents.id)));
    return rows.map((r) => ({
      entity: "document",
      id: r.id,
      label: r.title,
      deletedAt: r.deletedAt!,
    }));
  },
  async restore(tx, ownerId, rootId, now) {
    const [root] = await tx
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.ownerId, ownerId),
          eq(documents.id, rootId),
          eq(documents.deletedRootId, rootId),
        ),
      );
    if (root) {
      const [parent] = await tx
        .select()
        .from(subjects)
        .where(and(eq(subjects.id, root.subjectId), liveOnly(subjects)));
      if (!parent) throw new DomainError("PARENT_DELETED", "The subject is deleted", 422);
    }
    const ids = await restoreByRoot(tx, documents, { ownerId, rootId, now });
    return ids.map((id) => upsert("document", id));
  },
};

const trash = createTrash([subjectParticipant, documentParticipant]);

const addSubject = (tx: Tx, ownerId: string, name = "Redes") => {
  const id = newId();
  return tx
    .insert(subjects)
    .values({ id, ownerId, name })
    .then(() => id);
};
const addDocument = (tx: Tx, ownerId: string, subjectId: string, title = "TCP") => {
  const id = newId();
  return tx
    .insert(documents)
    .values({ id, ownerId, subjectId, title })
    .then(() => id);
};

/** Deleting a subject cascades to its live documents, all under the subject's root. */
const deleteSubject = (tx: Tx, ownerId: string, id: string, now = NOW) =>
  softDelete(tx, subjects, { ownerId, id, rootId: id, now }).then(() =>
    softDeleteWhere(tx, documents, {
      ownerId,
      where: eq(documents.subjectId, id),
      rootId: id,
      now,
    }),
  );
const deleteDocument = (tx: Tx, ownerId: string, id: string, now = NOW) =>
  softDelete(tx, documents, { ownerId, id, rootId: id, now });

const liveDocuments = (tx: Tx, ownerId: string) =>
  tx
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), liveOnly(documents)))
    .then((rows) => rows.map((r) => r.id));

describe("soft delete helpers", () => {
  it("[_cross-cutting/soft-delete#AC-1] hide a deleted row from live reads", async () => {
    const owner = newId();

    const live = await withUser(db, owner, async (tx) => {
      const keep = await addSubject(tx, owner, "keep");
      const gone = await addSubject(tx, owner, "gone");
      await softDelete(tx, subjects, { ownerId: owner, id: gone, rootId: gone, now: NOW });
      const rows = await tx
        .select({ id: subjects.id })
        .from(subjects)
        .where(and(eq(subjects.ownerId, owner), liveOnly(subjects)));
      return { keep, ids: rows.map((r) => r.id) };
    });

    expect(live.ids).toEqual([live.keep]);
  });

  it("[_cross-cutting/soft-delete#AC-2] refuse to delete a deleted row again and leave it untouched", async () => {
    const owner = newId();
    const later = new Date("2026-04-01T00:00:00Z");

    const result = await withUser(db, owner, async (tx) => {
      const id = await addSubject(tx, owner);
      const first = await softDelete(tx, subjects, { ownerId: owner, id, rootId: id, now: NOW });
      const again = await softDelete(tx, subjects, {
        ownerId: owner,
        id,
        rootId: newId(),
        now: later,
      });
      const [row] = await tx.select().from(subjects).where(eq(subjects.id, id));
      return { id, first, again, row };
    });

    expect(result.first).toBe(true);
    expect(result.again).toBe(false);
    expect(result.row).toMatchObject({ deletedAt: NOW, deletedRootId: result.id });
  });

  it("do not delete a row of another owner", async () => {
    const [alice, bob] = [newId(), newId()];
    const id = await withUser(db, alice, (tx) => addSubject(tx, alice));

    const deleted = await withUser(db, bob, (tx) =>
      softDelete(tx, subjects, { ownerId: bob, id, rootId: id, now: NOW }),
    );

    expect(deleted).toBe(false);
  });
});

describe("trash", () => {
  it("[_cross-cutting/soft-delete#AC-3] restores a trash item together with what was deleted with it", async () => {
    const owner = newId();
    const { subject, docs } = await withUser(db, owner, async (tx) => {
      const subject = await addSubject(tx, owner);
      const docs = [await addDocument(tx, owner, subject), await addDocument(tx, owner, subject)];
      await deleteSubject(tx, owner, subject);
      return { subject, docs };
    });
    expect(await withUser(db, owner, (tx) => liveDocuments(tx, owner))).toEqual([]);

    await trash.restore(db, owner, subject, NOW);

    expect((await withUser(db, owner, (tx) => liveDocuments(tx, owner))).sort()).toEqual(
      [...docs].sort(),
    );
    const [row] = await withUser(db, owner, (tx) =>
      tx.select().from(subjects).where(eq(subjects.id, subject)),
    );
    expect(row).toMatchObject({ deletedAt: null, deletedRootId: null });
  });

  it("[_cross-cutting/soft-delete#AC-3] records an upsert in the change log for every restored row", async () => {
    const owner = newId();
    const { subject, doc } = await withUser(db, owner, async (tx) => {
      const subject = await addSubject(tx, owner);
      const doc = await addDocument(tx, owner, subject);
      await deleteSubject(tx, owner, subject);
      return { subject, doc };
    });

    await trash.restore(db, owner, subject, NOW);

    const { rows } = await admin.query(
      `select entity, entity_id, op from platform.change_log where owner_id = $1 order by seq`,
      [owner],
    );
    expect(rows).toEqual([
      { entity: "subject", entity_id: subject, op: "upsert" },
      { entity: "document", entity_id: doc, op: "upsert" },
    ]);
  });

  it("[_cross-cutting/soft-delete#AC-3] keeps a child deleted on its own deleted when the parent is restored", async () => {
    const owner = newId();
    const { subject, early, other } = await withUser(db, owner, async (tx) => {
      const subject = await addSubject(tx, owner);
      const early = await addDocument(tx, owner, subject, "early");
      const other = await addDocument(tx, owner, subject, "other");
      await deleteDocument(tx, owner, early);
      await deleteSubject(tx, owner, subject);
      return { subject, early, other };
    });

    await trash.restore(db, owner, subject, NOW);

    expect(await withUser(db, owner, (tx) => liveDocuments(tx, owner))).toEqual([other]);
    const items = await trash.list(db, owner, NOW);
    expect(items.map((i) => i.id)).toEqual([early]);
  });

  it("[_cross-cutting/soft-delete#AC-4] refuses to restore a row deleted by cascade on its own", async () => {
    const owner = newId();
    const { subject, doc } = await withUser(db, owner, async (tx) => {
      const subject = await addSubject(tx, owner);
      const doc = await addDocument(tx, owner, subject);
      await deleteSubject(tx, owner, subject);
      return { subject, doc };
    });

    await expect(trash.restore(db, owner, doc, NOW)).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND", status: 404 }),
    );
    await expect(trash.restore(db, owner, newId(), NOW)).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(await withUser(db, owner, (tx) => liveDocuments(tx, owner))).toEqual([]);
    expect((await trash.list(db, owner, NOW)).map((i) => i.id)).toEqual([subject]);
  });

  it("[_cross-cutting/soft-delete#AC-5] lists only directly deleted items inside the 30-day window, newest first", async () => {
    const owner = newId();
    const day = 24 * 60 * 60 * 1000;
    const { cascaded, direct, expired, subject } = await withUser(db, owner, async (tx) => {
      const subject = await addSubject(tx, owner, "Redes");
      const cascaded = await addDocument(tx, owner, subject, "cascaded");
      const direct = await addDocument(tx, owner, await addSubject(tx, owner, "Other"), "direct");
      const expired = await addSubject(tx, owner, "expired");
      await deleteSubject(tx, owner, expired, new Date(NOW.getTime() - 31 * day));
      await deleteDocument(tx, owner, direct, new Date(NOW.getTime() - 2 * day));
      await deleteSubject(tx, owner, subject, new Date(NOW.getTime() - 1 * day));
      return { cascaded, direct, expired, subject };
    });

    const items = await trash.list(db, owner, NOW);

    expect(items.map((i) => [i.entity, i.id, i.label])).toEqual([
      ["subject", subject, "Redes"],
      ["document", direct, "direct"],
    ]);
    expect(items.map((i) => i.id)).not.toContain(cascaded);
    expect(items.map((i) => i.id)).not.toContain(expired);
  });

  it("[_cross-cutting/soft-delete#AC-7] rejects restoring a document whose subject was deleted afterwards", async () => {
    const owner = newId();
    const { subject, doc } = await withUser(db, owner, async (tx) => {
      const subject = await addSubject(tx, owner);
      const doc = await addDocument(tx, owner, subject);
      await deleteDocument(tx, owner, doc);
      await deleteSubject(tx, owner, subject);
      return { subject, doc };
    });

    await expect(trash.restore(db, owner, doc, NOW)).rejects.toThrow(
      expect.objectContaining({ code: "PARENT_DELETED" }),
    );
    expect(await withUser(db, owner, (tx) => liveDocuments(tx, owner))).toEqual([]);

    await trash.restore(db, owner, subject, NOW);
    await trash.restore(db, owner, doc, NOW);

    expect(await withUser(db, owner, (tx) => liveDocuments(tx, owner))).toEqual([doc]);
  });

  it("does not show or restore the trash of another owner", async () => {
    const [alice, bob] = [newId(), newId()];
    const subject = await withUser(db, alice, async (tx) => {
      const id = await addSubject(tx, alice);
      await deleteSubject(tx, alice, id);
      return id;
    });

    expect(await trash.list(db, bob, NOW)).toEqual([]);
    await expect(trash.restore(db, bob, subject, NOW)).rejects.toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect((await trash.list(db, alice, NOW)).map((i) => i.id)).toEqual([subject]);
  });
});

describe("the soft-delete marker", () => {
  const SCHEMAS = ["platform", "library", "annotation", "outline", "study", "export"];

  it("exists with its consistency check on every table that has deleted_at", async () => {
    const { rows } = await admin.query<{ table: string; marker: boolean; checked: boolean }>(
      `select n.nspname || '.' || c.relname as "table",
              exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'deleted_root_id' and not a.attisdropped) as marker,
              exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'c'
                        and pg_get_constraintdef(k.oid) like '%deleted_root_id%') as checked
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname = any($1)
          and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'deleted_at' and not a.attisdropped)
        order by 1`,
      [SCHEMAS],
    );

    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows.filter((r) => !r.marker || !r.checked).map((r) => r.table)).toEqual([]);
  });

  it("rejects a row that is deleted without a root, or a root on a live row", async () => {
    const owner = newId();
    const insert = (deletedAt: string | null, root: string | null) =>
      admin.query(
        `insert into library.subjects (id, owner_id, name, deleted_at, deleted_root_id) values ($1, $2, 'x', $3, $4)`,
        [newId(), owner, deletedAt, root],
      );

    await expect(insert("2026-01-01T00:00:00Z", null)).rejects.toThrow(/check/i);
    await expect(insert(null, newId())).rejects.toThrow(/check/i);
    await expect(insert("2026-01-01T00:00:00Z", newId())).resolves.toBeDefined();
    await expect(insert(null, null)).resolves.toBeDefined();
  });
});
