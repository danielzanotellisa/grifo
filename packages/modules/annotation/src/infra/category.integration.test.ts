import {
  createSyncEngine,
  createTrash,
  newId,
  withUser,
  type Db,
  type Mutation,
  type SyncHandler,
} from "@app/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "../domain/category";
import { createCategorySyncHandler } from "./category-sync";
import { seedDefaultCategories } from "./seed";
import { categoryTrashParticipant } from "./category-trash";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

/** Highlights have no handler yet; this stand-in lets a pull deliver the ones a category delete moves. */
const highlightReader: SyncHandler = {
  entity: "highlight",
  async apply() {
    throw new Error("not used");
  },
  async read(tx, ownerId, ids) {
    const { rows } = await tx.execute(
      sql`select id, category_id from annotation.highlights
           where owner_id = ${ownerId} and deleted_at is null
             and id = any(${sql.raw(`array[${ids.map((i) => `'${i}'`).join(",")}]::uuid[]`)})`,
    );
    return new Map(
      (rows as { id: string; category_id: string }[]).map((r) => [
        r.id,
        { categoryId: r.category_id },
      ]),
    );
  },
};

const engine = createSyncEngine([createCategorySyncHandler(), highlightReader]);
const trash = createTrash([categoryTrashParticipant]);

type CategoryData = {
  id: string;
  name: string;
  color: string;
  role: "TOPIC" | "DEFINITION" | "ITEM" | "IGNORE";
  shortcut: number | null;
  position: string;
};

let positionCounter = 0;
const category = (overrides: Partial<CategoryData> = {}): CategoryData => ({
  id: newId(),
  name: `Categoria ${++positionCounter}`,
  color: "#4F8EF7",
  role: "ITEM",
  shortcut: null,
  position: `a${positionCounter}`,
  ...overrides,
});

const mutation = (op: "upsert" | "delete", data: unknown): Mutation => ({
  mutationId: newId(),
  entity: "category",
  op,
  data,
});
const send = async (owner: string, m: Mutation) => (await engine.push(db, owner, [m])).results[0]!;
const store = async (owner: string, ...cats: CategoryData[]) => {
  for (const c of cats) expect((await send(owner, mutation("upsert", c))).status).toBe("applied");
};
const remove = (owner: string, id: string, extra: Record<string, unknown> = {}) =>
  send(owner, mutation("delete", { id, ...extra }));
const rejected = (code: string) => expect.objectContaining({ status: "rejected", code });
const changesOf = async (owner: string) => (await engine.pull(db, owner, 0)).changes;

type Row = {
  name: string;
  color: string;
  shortcut: number | null;
  deleted_at: Date | null;
  deleted_root_id: string | null;
};
const rowOf = async (id: string) =>
  (
    await admin.query<Row>(
      `select name, color, shortcut, deleted_at, deleted_root_id from annotation.categories where id = $1`,
      [id],
    )
  ).rows[0];

const seedHighlights = async (owner: string, categoryId: string, count: number) => {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = newId();
    ids.push(id);
    await admin.query(
      `insert into annotation.highlights (id, owner_id, document_id, category_id, page_index, rects, quote)
       values ($1, $2, $3, $4, 0, '[{"x1":0,"y1":0,"x2":1,"y2":1}]', '{"exact":"x","prefix":"","suffix":""}')`,
      [id, owner, newId(), categoryId],
    );
  }
  return ids;
};
const highlightCategory = async (id: string) =>
  (
    await admin.query<{ category_id: string }>(
      `select category_id from annotation.highlights where id = $1`,
      [id],
    )
  ).rows[0]!.category_id;

describe("category sync: create and edit", () => {
  it("[category#AC-3] stores a valid category with the trimmed name and pulls it back", async () => {
    const owner = newId();
    const data = category({
      name: "  Definição  ",
      role: "DEFINITION",
      shortcut: 2,
      color: "#F7D04F",
    });

    await store(owner, data);

    expect((await rowOf(data.id))?.name).toBe("Definição");
    expect(await changesOf(owner)).toEqual([
      {
        entity: "category",
        entityId: data.id,
        op: "upsert",
        data: { ...data, name: "Definição" },
      },
    ]);
  });

  it("[category#AC-3] rejects an invalid name, color or shape and stores nothing", async () => {
    const owner = newId();
    const valid = category();
    const withoutColor: Record<string, unknown> = { ...valid };
    delete withoutColor.color;

    for (const name of ["", "   ", "x".repeat(41)]) {
      expect(await send(owner, mutation("upsert", { ...valid, name }))).toEqual(
        rejected("CATEGORY_NAME_INVALID"),
      );
    }
    for (const color of ["red", "#12345", "#12345g", "4F8EF7"]) {
      expect(await send(owner, mutation("upsert", { ...valid, color }))).toEqual(
        rejected("COLOR_INVALID"),
      );
    }
    for (const data of [
      withoutColor,
      { ...valid, shortcut: 0 },
      { ...valid, shortcut: 10 },
      { ...valid, role: "X" },
      { ...valid, extra: 1 },
    ]) {
      expect(await send(owner, mutation("upsert", data))).toEqual(rejected("CATEGORY_INVALID"));
    }
    expect(await rowOf(valid.id)).toBeUndefined();
  });

  it("accepts a name of 40 characters", async () => {
    const owner = newId();

    await store(owner, category({ name: "x".repeat(40) }));
  });

  it("[category#AC-1] changes the color without touching any highlight", async () => {
    const owner = newId();
    const data = category();
    await store(owner, data);
    const highlights = await seedHighlights(owner, data.id, 10);
    const before = await admin.query(
      `select id, updated_at from annotation.highlights where category_id = $1 order by id`,
      [data.id],
    );
    const logBefore = (
      await admin.query(`select count(*)::int as n from platform.change_log where owner_id = $1`, [
        owner,
      ])
    ).rows[0].n;

    await store(owner, { ...data, color: "#00ff00" });

    const after = await admin.query(
      `select id, updated_at from annotation.highlights where category_id = $1 order by id`,
      [data.id],
    );
    const logAfter = (
      await admin.query(`select entity from platform.change_log where owner_id = $1`, [owner])
    ).rows;
    expect(after.rows).toEqual(before.rows);
    expect(after.rows).toHaveLength(highlights.length);
    expect(logAfter.map((r) => r.entity)).not.toContain("highlight");
    expect(logAfter.length).toBe(logBefore + 1);
    expect((await changesOf(owner))[0]).toMatchObject({ data: { color: "#00ff00" } });
  });
});

describe("category uniqueness", () => {
  it("[category#AC-4] refuses a name taken by another live category, ignoring case", async () => {
    const owner = newId();
    const first = category({ name: "Definição" });
    await store(owner, first);

    for (const name of ["Definição", "DEFINIÇÃO", " definição "]) {
      expect(await send(owner, mutation("upsert", category({ name })))).toEqual(
        rejected("CATEGORY_NAME_TAKEN"),
      );
    }
    expect(await send(owner, mutation("upsert", { ...first, color: "#000000" }))).toMatchObject({
      status: "applied",
    });
  });

  it("[category#AC-4] refuses a shortcut taken by another live category", async () => {
    const owner = newId();
    const first = category({ shortcut: 3 });
    await store(owner, first);

    expect(await send(owner, mutation("upsert", category({ shortcut: 3 })))).toEqual(
      rejected("CATEGORY_SHORTCUT_TAKEN"),
    );
    expect(await send(owner, mutation("upsert", category({ shortcut: 4 })))).toMatchObject({
      status: "applied",
    });
    expect(await send(owner, mutation("upsert", category({ shortcut: null })))).toMatchObject({
      status: "applied",
    });
    expect(await send(owner, mutation("upsert", category({ shortcut: null })))).toMatchObject({
      status: "applied",
    });
  });

  it("[category#AC-4] lets the name and shortcut of a deleted category be reused, and users be independent", async () => {
    const [alice, bob] = [newId(), newId()];
    const old = category({ name: "Exemplo", shortcut: 5 });
    await store(alice, old, category());
    await remove(alice, old.id);

    await store(alice, category({ name: "Exemplo", shortcut: 5 }));
    await store(bob, category({ name: "Exemplo", shortcut: 5 }));
  });
});

describe("category delete", () => {
  it("[category#AC-5] soft-deletes an unused category under its own root and delivers a tombstone", async () => {
    const owner = newId();
    const [keep, gone] = [category(), category()];
    await store(owner, keep, gone);

    expect((await remove(owner, gone.id)).status).toBe("applied");

    expect(await rowOf(gone.id)).toMatchObject({ deleted_root_id: gone.id });
    expect(await changesOf(owner)).toContainEqual({
      entity: "category",
      entityId: gone.id,
      op: "delete",
    });
  });

  it("[category#AC-5] answers NOT_FOUND for a deleted category or one of another user", async () => {
    const [alice, bob] = [newId(), newId()];
    const [a, b] = [category({ name: "Da Alice" }), category()];
    await store(alice, a, b);

    expect(await send(bob, mutation("upsert", { ...a, name: "Do Bob" }))).toEqual(
      rejected("NOT_FOUND"),
    );
    expect(await remove(bob, a.id)).toEqual(rejected("NOT_FOUND"));
    expect((await rowOf(a.id))?.name).toBe("Da Alice");

    await remove(alice, b.id);
    expect(await send(alice, mutation("upsert", b))).toEqual(rejected("NOT_FOUND"));
    expect(await remove(alice, b.id)).toEqual(rejected("NOT_FOUND"));
  });

  it("[category#AC-6] requires moveHighlightsTo for a category in use and moves the highlights", async () => {
    const owner = newId();
    const [used, target] = [category(), category()];
    await store(owner, used, target);
    const highlights = await seedHighlights(owner, used.id, 3);

    expect(await remove(owner, used.id)).toEqual(rejected("CATEGORY_IN_USE"));
    expect((await rowOf(used.id))?.deleted_at).toBeNull();
    expect(await highlightCategory(highlights[0]!)).toBe(used.id);

    expect((await remove(owner, used.id, { moveHighlightsTo: target.id })).status).toBe("applied");

    for (const id of highlights) expect(await highlightCategory(id)).toBe(target.id);
    expect((await rowOf(used.id))?.deleted_root_id).toBe(used.id);
    const changes = await changesOf(owner);
    for (const id of highlights) {
      expect(changes).toContainEqual({
        entity: "highlight",
        entityId: id,
        op: "upsert",
        data: { categoryId: target.id },
      });
    }
  });

  it("[category#AC-6] rejects a deleted, missing, foreign or own target and changes nothing", async () => {
    const [owner, other] = [newId(), newId()];
    const [used, spare, gone, foreign] = [category(), category(), category(), category()];
    await store(owner, used, spare, gone);
    await store(other, foreign);
    await remove(owner, gone.id);
    const highlights = await seedHighlights(owner, used.id, 2);

    for (const target of [gone.id, newId(), foreign.id]) {
      expect(await remove(owner, used.id, { moveHighlightsTo: target })).toEqual(
        rejected("PARENT_DELETED"),
      );
    }
    expect(await remove(owner, used.id, { moveHighlightsTo: used.id })).toEqual(
      rejected("CATEGORY_INVALID"),
    );
    expect((await rowOf(used.id))?.deleted_at).toBeNull();
    for (const id of highlights) expect(await highlightCategory(id)).toBe(used.id);
  });

  it("[category#AC-7] refuses to delete the last live category", async () => {
    const owner = newId();
    const only = category();
    await store(owner, only);
    await seedHighlights(owner, only.id, 1);

    expect(await remove(owner, only.id)).toEqual(rejected("CATEGORY_LAST"));
    expect((await rowOf(only.id))?.deleted_at).toBeNull();

    const spare = category();
    await store(owner, spare);
    await remove(owner, only.id, { moveHighlightsTo: spare.id });
    expect(await remove(owner, spare.id)).toEqual(rejected("CATEGORY_LAST"));
  });
});

describe("category trash", () => {
  it("[category#AC-8] lists a deleted category with its name and restores it", async () => {
    const owner = newId();
    const [keep, gone] = [category(), category({ name: "Importante", shortcut: 4 })];
    await store(owner, keep, gone);
    await remove(owner, gone.id);

    const items = await trash.list(db, owner);
    await trash.restore(db, owner, gone.id);

    expect(items.map((i) => [i.entity, i.id, i.label])).toEqual([
      ["category", gone.id, "Importante"],
    ]);
    expect(await rowOf(gone.id)).toMatchObject({
      deleted_at: null,
      deleted_root_id: null,
      shortcut: 4,
    });
  });

  it("[category#AC-8] refuses to restore while a live category took its name or shortcut", async () => {
    const owner = newId();
    const [keep, byName, byShortcut] = [
      category(),
      category({ name: "Exemplo" }),
      category({ shortcut: 6 }),
    ];
    await store(owner, keep, byName, byShortcut);
    await remove(owner, byName.id);
    await remove(owner, byShortcut.id);
    await store(owner, category({ name: "exemplo" }), category({ shortcut: 6 }));

    await expect(trash.restore(db, owner, byName.id)).rejects.toThrow(
      expect.objectContaining({ code: "CATEGORY_NAME_TAKEN" }),
    );
    await expect(trash.restore(db, owner, byShortcut.id)).rejects.toThrow(
      expect.objectContaining({ code: "CATEGORY_SHORTCUT_TAKEN" }),
    );
    expect((await rowOf(byName.id))?.deleted_at).not.toBeNull();
    expect((await rowOf(byShortcut.id))?.deleted_at).not.toBeNull();
  });
});

describe("default categories", () => {
  const translate = (key: string) => `t:${key}`;

  it("[category#AC-9] seeds the four defaults for an owner with none, in order, and delivers them", async () => {
    const owner = newId();

    const ids = await withUser(db, owner, (tx) => seedDefaultCategories(tx, owner, translate));

    expect(ids).toHaveLength(4);
    const { rows } = await admin.query<{
      name: string;
      color: string;
      role: string;
      shortcut: number;
    }>(
      `select name, color, role, shortcut from annotation.categories where owner_id = $1 order by position`,
      [owner],
    );
    expect(rows).toEqual(
      DEFAULT_CATEGORIES.map((d) => ({
        name: `t:${d.nameKey}`,
        color: d.color,
        role: d.role,
        shortcut: d.shortcut,
      })),
    );
    expect((await changesOf(owner)).map((c) => c.entityId).sort()).toEqual([...ids].sort());
  });

  it("[category#AC-9] seeds nothing again, or for an owner who already has a live category", async () => {
    const [seeded, custom] = [newId(), newId()];
    await withUser(db, seeded, (tx) => seedDefaultCategories(tx, seeded, translate));
    await store(custom, category());

    expect(
      await withUser(db, seeded, (tx) => seedDefaultCategories(tx, seeded, translate)),
    ).toEqual([]);
    expect(
      await withUser(db, custom, (tx) => seedDefaultCategories(tx, custom, translate)),
    ).toEqual([]);

    const count = async (owner: string) =>
      (await admin.query(`select 1 from annotation.categories where owner_id = $1`, [owner]))
        .rowCount;
    expect(await count(seeded)).toBe(4);
    expect(await count(custom)).toBe(1);
  });
});
