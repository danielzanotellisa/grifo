import {
  createInProcessEventBus,
  createSyncEngine,
  createTrash,
  newId,
  withUser,
  type Db,
  type Mutation,
} from "@app/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createCategorySyncHandler } from "./category-sync";
import { createHighlightSyncHandler } from "./highlight-sync";
import { createHighlightTrashParticipant } from "./highlight-trash";
import { registerAnnotationReactions } from "./reactions";
import { categoryTrashParticipant } from "./category-trash";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

type DocumentInfo = { status: string; pageCount: number | null };
const documents = new Map<string, DocumentInfo>();
const documentState = async (_tx: unknown, _ownerId: string, id: string) =>
  documents.get(id) ?? null;

const placed: { highlightId: string; documentId: string }[] = [];
const ignored: { highlightId: string; documentId: string }[] = [];
const deleted: { highlightId: string; rootId: string }[] = [];
const events = createInProcessEventBus();
events.subscribe("annotation.highlightPlaced", async (_tx, e) => void placed.push(e));
events.subscribe("annotation.highlightIgnored", async (_tx, e) => void ignored.push(e));
events.subscribe("annotation.highlightDeleted", async (_tx, e) => void deleted.push(e));
registerAnnotationReactions(events);

const engine = createSyncEngine([
  createCategorySyncHandler({ events }),
  createHighlightSyncHandler({ events, documentState }),
]);
const trash = createTrash([
  createHighlightTrashParticipant({ documentState }),
  categoryTrashParticipant,
]);

const reset = () => {
  placed.length = 0;
  ignored.length = 0;
  deleted.length = 0;
};

const mutation = (entity: string, op: "upsert" | "delete", data: unknown): Mutation => ({
  mutationId: newId(),
  entity,
  op,
  data,
});
const send = async (owner: string, m: Mutation) => (await engine.push(db, owner, [m])).results[0]!;
const rejected = (code: string) => expect.objectContaining({ status: "rejected", code });
const changesOf = async (owner: string) => (await engine.pull(db, owner, 0)).changes;

let counter = 0;
const newCategory = async (
  owner: string,
  role: "TOPIC" | "DEFINITION" | "ITEM" | "IGNORE" = "ITEM",
) => {
  const id = newId();
  counter += 1;
  const data = {
    id,
    name: `Categoria ${counter}`,
    color: "#4F8EF7",
    role,
    shortcut: null,
    position: `a${counter}`,
  };
  expect((await send(owner, mutation("category", "upsert", data))).status).toBe("applied");
  return id;
};
const newDocument = (info: DocumentInfo = { status: "READY", pageCount: 10 }) => {
  const id = newId();
  documents.set(id, info);
  return id;
};

type HighlightData = {
  id: string;
  documentId: string;
  categoryId: string;
  pageIndex: number;
  rects: { x1: number; y1: number; x2: number; y2: number }[];
  quote: { exact: string; prefix: string; suffix: string };
  note: string | null;
};
const highlight = (
  documentId: string,
  categoryId: string,
  overrides: Partial<HighlightData> = {},
): HighlightData => ({
  id: newId(),
  documentId,
  categoryId,
  pageIndex: 0,
  rects: [{ x1: 10, y1: 700, x2: 200, y2: 712 }],
  quote: { exact: "protocolo orientado a conexão", prefix: "o TCP é um ", suffix: " e confiável" },
  note: null,
  ...overrides,
});
const store = async (owner: string, ...items: HighlightData[]) => {
  for (const item of items)
    expect((await send(owner, mutation("highlight", "upsert", item))).status).toBe("applied");
};

type Row = {
  category_id: string;
  note: string | null;
  quote: { exact: string };
  deleted_at: Date | null;
  deleted_root_id: string | null;
};
const rowOf = async (id: string) =>
  (
    await admin.query<Row>(
      `select category_id, note, quote, deleted_at, deleted_root_id from annotation.highlights where id = $1`,
      [id],
    )
  ).rows[0];

describe("highlight create", () => {
  it("[highlight#AC-6][highlight#AC-4] stores the normalized quote, pulls it back and asks for a node", async () => {
    const owner = newId();
    const [doc, category] = [newDocument(), await newCategory(owner)];
    const item = highlight(doc, category, {
      quote: { exact: "orien-\ntado a conexão", prefix: "", suffix: "" },
    });
    reset();

    await store(owner, item);

    expect((await rowOf(item.id))?.quote.exact).toBe("orientado a conexão");
    const pulled = (await changesOf(owner)).find((c) => c.entityId === item.id);
    expect(pulled).toEqual({
      entity: "highlight",
      entityId: item.id,
      op: "upsert",
      data: { ...item, quote: { exact: "orientado a conexão", prefix: "", suffix: "" } },
    });
    expect(placed).toEqual([
      { type: "annotation.highlightPlaced", ownerId: owner, highlightId: item.id, documentId: doc },
    ]);
  });

  it("[highlight#AC-6] asks for no node when the category role is IGNORE", async () => {
    const owner = newId();
    const [doc, category] = [newDocument(), await newCategory(owner, "IGNORE")];
    reset();

    await store(owner, highlight(doc, category));

    expect(placed).toEqual([]);
  });

  it("[highlight#AC-7] rejects an empty quote and malformed data and stores nothing", async () => {
    const owner = newId();
    const [doc, category] = [newDocument(), await newCategory(owner)];
    const base = highlight(doc, category);
    const emptyQuotes = ["", "   ", " \n "];
    const malformed = [
      { ...base, rects: [] },
      { ...base, rects: [{ x1: 1, y1: 1, x2: 2 }] },
      { ...base, rects: [{ x1: 1, y1: 1, x2: 2, y2: Number.NaN }] },
      { ...base, quote: { ...base.quote, prefix: "x".repeat(33) } },
      { ...base, quote: { ...base.quote, suffix: "x".repeat(33) } },
      { ...base, note: 5 },
      { ...base, extra: true },
      { ...base, id: "not-a-uuid" },
    ];

    for (const exact of emptyQuotes) {
      expect(
        await send(
          owner,
          mutation("highlight", "upsert", { ...base, quote: { ...base.quote, exact } }),
        ),
      ).toEqual(rejected("HIGHLIGHT_EMPTY"));
    }
    for (const data of malformed) {
      expect(await send(owner, mutation("highlight", "upsert", data))).toEqual(
        rejected("HIGHLIGHT_INVALID"),
      );
    }
    expect(await rowOf(base.id)).toBeUndefined();
  });

  it("[highlight#AC-8] rejects a document or category that is deleted or missing", async () => {
    const owner = newId();
    const [doc, category] = [newDocument(), await newCategory(owner)];
    const gone = await newCategory(owner);
    await send(owner, mutation("category", "delete", { id: gone }));

    const cases = [highlight(newId(), category), highlight(doc, newId()), highlight(doc, gone)];

    for (const item of cases) {
      expect(await send(owner, mutation("highlight", "upsert", item))).toEqual(
        rejected("PARENT_DELETED"),
      );
      expect(await rowOf(item.id)).toBeUndefined();
    }
  });

  it("[highlight#AC-8] rejects a document that is not READY and a page beyond the page count", async () => {
    const owner = newId();
    const category = await newCategory(owner);
    const pending = newDocument({ status: "VALIDATING", pageCount: null });
    const ready = newDocument({ status: "READY", pageCount: 10 });

    const notReady = highlight(pending, category);
    expect(await send(owner, mutation("highlight", "upsert", notReady))).toEqual(
      rejected("DOCUMENT_NOT_READY"),
    );
    for (const pageIndex of [10, 11, -1, 1.5]) {
      const item = highlight(ready, category, { pageIndex });
      expect(await send(owner, mutation("highlight", "upsert", item))).toEqual(
        rejected("HIGHLIGHT_INVALID"),
      );
      expect(await rowOf(item.id)).toBeUndefined();
    }
    await store(owner, highlight(ready, category, { pageIndex: 9 }));
    expect(await rowOf(notReady.id)).toBeUndefined();
  });
});

describe("highlight edit", () => {
  it("[highlight#AC-9] changes only the category and the note", async () => {
    const owner = newId();
    const [doc, first, second] = [
      newDocument(),
      await newCategory(owner),
      await newCategory(owner, "DEFINITION"),
    ];
    const item = highlight(doc, first);
    await store(owner, item);

    await store(owner, { ...item, categoryId: second, note: "revisar" });

    expect(await rowOf(item.id)).toMatchObject({ category_id: second, note: "revisar" });
    const immutable: Partial<HighlightData>[] = [
      { pageIndex: 3 },
      { documentId: newDocument() },
      { rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }] },
      { quote: { exact: "outro texto", prefix: "", suffix: "" } },
    ];
    for (const change of immutable) {
      expect(
        await send(
          owner,
          mutation("highlight", "upsert", {
            ...item,
            categoryId: second,
            note: "revisar",
            ...change,
          }),
        ),
      ).toEqual(rejected("HIGHLIGHT_INVALID"));
    }
    expect(await rowOf(item.id)).toMatchObject({ category_id: second, note: "revisar" });
  });

  it("[highlight#AC-9] answers NOT_FOUND for a deleted highlight or one of another user", async () => {
    const [alice, bob] = [newId(), newId()];
    const [doc, category] = [newDocument(), await newCategory(alice)];
    const bobCategory = await newCategory(bob);
    const item = highlight(doc, category, { note: "da Alice" });
    await store(alice, item);

    expect(
      await send(
        bob,
        mutation("highlight", "upsert", { ...item, categoryId: bobCategory, note: "do Bob" }),
      ),
    ).toEqual(rejected("NOT_FOUND"));
    expect(await send(bob, mutation("highlight", "delete", { id: item.id }))).toEqual(
      rejected("NOT_FOUND"),
    );
    await send(alice, mutation("highlight", "delete", { id: item.id }));
    expect(
      await send(alice, mutation("highlight", "upsert", { ...item, note: "editado" })),
    ).toEqual(rejected("NOT_FOUND"));
    expect((await rowOf(item.id))?.note).toBe("da Alice");
  });

  it("[highlight#AC-13] asks to remove or add the node only when the move crosses IGNORE", async () => {
    const owner = newId();
    const doc = newDocument();
    const [item, topic, example, ignore] = [
      await newCategory(owner, "ITEM"),
      await newCategory(owner, "TOPIC"),
      await newCategory(owner, "ITEM"),
      await newCategory(owner, "IGNORE"),
    ];
    const h = highlight(doc, item);
    await store(owner, h);
    reset();

    await store(owner, { ...h, categoryId: topic });
    await store(owner, { ...h, categoryId: example });
    expect([placed.length, ignored.length]).toEqual([0, 0]);

    await store(owner, { ...h, categoryId: ignore });
    expect(ignored).toEqual([
      { type: "annotation.highlightIgnored", ownerId: owner, highlightId: h.id, documentId: doc },
    ]);

    await store(owner, { ...h, categoryId: example });
    expect(placed).toEqual([
      { type: "annotation.highlightPlaced", ownerId: owner, highlightId: h.id, documentId: doc },
    ]);
  });

  it("[highlight#AC-5] asks to remove the nodes of a category whose role becomes IGNORE, and to add them back", async () => {
    const owner = newId();
    const [doc, category] = [newDocument(), await newCategory(owner, "ITEM")];
    const [a, b] = [highlight(doc, category), highlight(doc, category)];
    await store(owner, a, b);
    const row = (await changesOf(owner)).find((c) => c.entity === "category")!.data as Record<
      string,
      unknown
    >;
    reset();

    await send(owner, mutation("category", "upsert", { ...row, role: "IGNORE" }));
    expect(ignored.map((e) => e.highlightId).sort()).toEqual([a.id, b.id].sort());

    reset();
    await send(owner, mutation("category", "upsert", { ...row, role: "DEFINITION" }));
    expect(placed.map((e) => e.highlightId).sort()).toEqual([a.id, b.id].sort());

    reset();
    await send(owner, mutation("category", "upsert", { ...row, role: "TOPIC", color: "#000000" }));
    expect([placed.length, ignored.length]).toEqual([0, 0]);
  });

  it("[highlight#AC-13] asks to remove or add nodes when deleting a category moves its highlights across IGNORE", async () => {
    const owner = newId();
    const doc = newDocument();
    const [item, ignore, other] = [
      await newCategory(owner, "ITEM"),
      await newCategory(owner, "IGNORE"),
      await newCategory(owner, "DEFINITION"),
    ];
    const h = highlight(doc, item);
    await store(owner, h);
    reset();

    await send(owner, mutation("category", "delete", { id: item, moveHighlightsTo: ignore }));
    expect(ignored.map((e) => e.highlightId)).toEqual([h.id]);

    reset();
    await send(owner, mutation("category", "delete", { id: ignore, moveHighlightsTo: other }));
    expect(placed.map((e) => e.highlightId)).toEqual([h.id]);
  });
});

describe("highlight delete and cascade", () => {
  it("[highlight#AC-10] soft-deletes under its own root, announces it and delivers a tombstone", async () => {
    const owner = newId();
    const [doc, category] = [newDocument(), await newCategory(owner)];
    const item = highlight(doc, category);
    await store(owner, item);
    reset();

    expect((await send(owner, mutation("highlight", "delete", { id: item.id }))).status).toBe(
      "applied",
    );
    expect(await send(owner, mutation("highlight", "delete", { id: item.id }))).toEqual(
      rejected("NOT_FOUND"),
    );

    expect(await rowOf(item.id)).toMatchObject({ deleted_root_id: item.id });
    expect(deleted).toEqual([
      {
        type: "annotation.highlightDeleted",
        ownerId: owner,
        highlightId: item.id,
        rootId: item.id,
      },
    ]);
    expect(await changesOf(owner)).toContainEqual({
      entity: "highlight",
      entityId: item.id,
      op: "delete",
    });
  });

  it("[highlight#AC-11] deletes every highlight of a deleted document under the document's root", async () => {
    const owner = newId();
    const [doc, other, category] = [newDocument(), newDocument(), await newCategory(owner)];
    const [earlier, a, b, untouched] = [
      highlight(doc, category),
      highlight(doc, category),
      highlight(doc, category),
      highlight(other, category),
    ];
    await store(owner, earlier, a, b, untouched);
    await send(owner, mutation("highlight", "delete", { id: earlier.id }));

    await withUser(db, owner, (tx) =>
      events.publish(tx, {
        type: "library.documentDeleted",
        ownerId: owner,
        documentId: doc,
        rootId: doc,
      }),
    );

    expect(await rowOf(a.id)).toMatchObject({ deleted_root_id: doc });
    expect(await rowOf(b.id)).toMatchObject({ deleted_root_id: doc });
    expect(await rowOf(earlier.id)).toMatchObject({ deleted_root_id: earlier.id });
    expect((await rowOf(untouched.id))?.deleted_at).toBeNull();
    const changes = await changesOf(owner);
    expect(changes).toContainEqual({ entity: "highlight", entityId: a.id, op: "delete" });
    expect(changes).toContainEqual({ entity: "highlight", entityId: b.id, op: "delete" });
  });
});

describe("highlight trash", () => {
  it("[highlight#AC-12] lists a deleted highlight with its quote and restores it", async () => {
    const owner = newId();
    const [doc, category] = [newDocument(), await newCategory(owner)];
    const item = highlight(doc, category);
    await store(owner, item);
    await send(owner, mutation("highlight", "delete", { id: item.id }));

    const items = (await trash.list(db, owner)).filter((i) => i.entity === "highlight");
    await trash.restore(db, owner, item.id);

    expect(items.map((i) => [i.id, i.label])).toEqual([[item.id, "protocolo orientado a conexão"]]);
    expect(await rowOf(item.id)).toMatchObject({ deleted_at: null, deleted_root_id: null });
  });

  it("[highlight#AC-12] refuses to restore while its document or category is deleted", async () => {
    const owner = newId();
    const [doc, spare, category] = [
      newDocument(),
      await newCategory(owner),
      await newCategory(owner),
    ];
    const [byDocument, byCategory] = [highlight(doc, spare), highlight(newDocument(), category)];
    await store(owner, byDocument, byCategory);
    await send(owner, mutation("highlight", "delete", { id: byDocument.id }));
    await send(owner, mutation("highlight", "delete", { id: byCategory.id }));
    documents.delete(doc);
    await send(owner, mutation("category", "delete", { id: category }));

    await expect(trash.restore(db, owner, byDocument.id)).rejects.toThrow(
      expect.objectContaining({ code: "PARENT_DELETED" }),
    );
    await expect(trash.restore(db, owner, byCategory.id)).rejects.toThrow(
      expect.objectContaining({ code: "PARENT_DELETED" }),
    );
    expect((await rowOf(byDocument.id))?.deleted_at).not.toBeNull();
    expect((await rowOf(byCategory.id))?.deleted_at).not.toBeNull();

    documents.set(doc, { status: "READY", pageCount: 10 });
    await trash.restore(db, owner, byDocument.id);
    expect((await rowOf(byDocument.id))?.deleted_at).toBeNull();
  });
});
