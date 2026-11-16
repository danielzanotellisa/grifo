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
import { registerOutlineReactions } from "./reactions";
import { createOutlineSyncHandler } from "./sync-handler";
import { createOutlineTrashParticipant } from "./trash";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const liveDocuments = new Set<string>();
const documentIsLive = async (_tx: unknown, _ownerId: string, documentId: string) =>
  liveDocuments.has(documentId);

const engine = createSyncEngine([createOutlineSyncHandler({ documentIsLive })]);
const trash = createTrash([createOutlineTrashParticipant({ documentIsLive })]);
const events = createInProcessEventBus();
registerOutlineReactions(events);

type NodeData = {
  id: string;
  documentId: string;
  parentId: string | null;
  position: string;
  highlightId: string | null;
  role: "TOPIC" | "DEFINITION" | "ITEM" | null;
  text: string | null;
};

const newDocument = () => {
  const id = newId();
  liveDocuments.add(id);
  return id;
};

const nodeIn = (documentId: string, overrides: Partial<NodeData> = {}): NodeData => ({
  id: newId(),
  documentId,
  parentId: null,
  position: "a0",
  highlightId: null,
  role: "ITEM",
  text: "texto",
  ...overrides,
});

const upsert = (data: unknown) => ({
  mutationId: newId(),
  entity: "outlineNode",
  op: "upsert" as const,
  data,
});
const remove = (id: string) => ({
  mutationId: newId(),
  entity: "outlineNode",
  op: "delete" as const,
  data: { id },
});

/** Pushes one mutation and returns its result. */
const send = async (owner: string, mutation: Mutation) =>
  (await engine.push(db, owner, [mutation])).results[0]!;
const store = async (owner: string, ...nodes: NodeData[]) => {
  for (const n of nodes) expect((await send(owner, upsert(n))).status).toBe("applied");
};

type Row = {
  parent_id: string | null;
  position: string;
  text: string | null;
  document_id: string;
  deleted_at: Date | null;
  deleted_root_id: string | null;
};
const rowOf = async (id: string): Promise<Row | undefined> =>
  (
    await admin.query<Row>(
      `select parent_id, position, text, document_id, deleted_at, deleted_root_id from outline.nodes where id = $1`,
      [id],
    )
  ).rows[0];
const count = async (id: string) =>
  (await admin.query(`select 1 from outline.nodes where id = $1`, [id])).rowCount;
const liveChildren = async (documentId: string, parentId: string | null) =>
  (
    await admin.query<{ id: string }>(
      `select id from outline.nodes
        where document_id = $1 and deleted_at is null and parent_id is not distinct from $2
        order by position`,
      [documentId, parentId],
    )
  ).rows.map((r) => r.id);
const changesOf = async (owner: string) => (await engine.pull(db, owner, 0)).changes;
const rejected = (code: string) => expect.objectContaining({ status: "rejected", code });

describe("outline sync: upsert", () => {
  it("[outline-node#AC-7] stores a node, pulls it back verbatim and updates it in place", async () => {
    const owner = newId();
    const doc = newDocument();
    const parent = nodeIn(doc, { role: "TOPIC", text: "Camada de transporte" });
    const child = nodeIn(doc, {
      parentId: parent.id,
      position: "a1V",
      text: null,
      highlightId: newId(),
    });

    await store(owner, parent, child);
    const moved = { ...child, parentId: null, position: "a3" };
    await store(owner, moved);

    expect(await count(child.id)).toBe(1);
    const changes = await changesOf(owner);
    expect(changes).toEqual([
      { entity: "outlineNode", entityId: parent.id, op: "upsert", data: parent },
      { entity: "outlineNode", entityId: child.id, op: "upsert", data: moved },
    ]);
  });

  it("[outline-node#AC-8] rejects a node whose parent is deleted, missing, or whose document is not live", async () => {
    const owner = newId();
    const doc = newDocument();
    const parent = nodeIn(doc);
    await store(owner, parent);
    await send(owner, remove(parent.id));
    const orphans = [
      nodeIn(doc, { parentId: parent.id }),
      nodeIn(doc, { parentId: newId() }),
      nodeIn(newId()),
    ];

    for (const orphan of orphans) {
      expect(await send(owner, upsert(orphan))).toEqual(rejected("PARENT_DELETED"));
      expect(await count(orphan.id)).toBe(0);
    }
  });

  it("[outline-node#AC-8] rejects a parent that belongs to another document", async () => {
    const owner = newId();
    const [docA, docB] = [newDocument(), newDocument()];
    const parent = nodeIn(docA);
    await store(owner, parent);
    const child = nodeIn(docB, { parentId: parent.id });

    expect(await send(owner, upsert(child))).toEqual(rejected("OUTLINE_NODE_INVALID"));
    expect(await count(child.id)).toBe(0);
  });

  it("[outline-node#AC-9][outline-node#AC-6] rejects a node placed under itself or a descendant", async () => {
    const owner = newId();
    const doc = newDocument();
    const a = nodeIn(doc);
    const b = nodeIn(doc, { parentId: a.id });
    const c = nodeIn(doc, { parentId: b.id });
    await store(owner, a, b, c);

    expect(await send(owner, upsert({ ...a, parentId: c.id }))).toEqual(rejected("OUTLINE_CYCLE"));
    expect(await send(owner, upsert({ ...a, parentId: a.id }))).toEqual(rejected("OUTLINE_CYCLE"));
    expect((await rowOf(a.id))?.parent_id).toBeNull();
  });

  it("[outline-node#AC-14] rejects malformed data, an invalid free-text node and an IGNORE role", async () => {
    const owner = newId();
    const doc = newDocument();
    const valid = nodeIn(doc);
    const withoutText: Record<string, unknown> = { ...valid };
    delete withoutText.text;
    const bad = [
      withoutText,
      { ...valid, id: "not-a-uuid" },
      { ...valid, position: "" },
      { ...valid, extra: true },
      { ...valid, role: null },
      { ...valid, text: "  " },
      { ...valid, role: "IGNORE" },
    ];

    for (const data of bad) {
      expect(await send(owner, upsert(data))).toEqual(rejected("OUTLINE_NODE_INVALID"));
    }
    expect(await count(valid.id)).toBe(0);
  });

  it("does not let a node change document", async () => {
    const owner = newId();
    const [docA, docB] = [newDocument(), newDocument()];
    const node = nodeIn(docA);
    await store(owner, node);

    expect(await send(owner, upsert({ ...node, documentId: docB }))).toEqual(
      rejected("OUTLINE_NODE_INVALID"),
    );
    expect((await rowOf(node.id))?.document_id).toBe(docA);
  });

  it("[outline-node#AC-12] answers NOT_FOUND for a node of another user or a deleted node", async () => {
    const [alice, bob] = [newId(), newId()];
    const doc = newDocument();
    const node = nodeIn(doc, { text: "da Alice" });
    await store(alice, node);

    expect(await send(bob, upsert({ ...node, text: "do Bob" }))).toEqual(rejected("NOT_FOUND"));
    expect(await send(bob, remove(node.id))).toEqual(rejected("NOT_FOUND"));
    expect((await rowOf(node.id))?.text).toBe("da Alice");

    await send(alice, remove(node.id));
    const deletedAt = (await rowOf(node.id))?.deleted_at;
    expect(await send(alice, upsert({ ...node, text: "editado" }))).toEqual(rejected("NOT_FOUND"));
    expect(await send(alice, remove(node.id))).toEqual(rejected("NOT_FOUND"));
    expect(await rowOf(node.id)).toMatchObject({ text: "da Alice", deleted_at: deletedAt });
  });
});

describe("outline sync: delete and cascades", () => {
  it("[outline-node#AC-10][outline-node#AC-2] deletes a node and promotes its children in its place", async () => {
    const owner = newId();
    const doc = newDocument();
    const a = nodeIn(doc, { position: "a0" });
    const [c1, c2, c3] = ["a0", "a1", "a2"].map((position) =>
      nodeIn(doc, { parentId: a.id, position }),
    );
    const b = nodeIn(doc, { position: "a1" });
    await store(owner, a, c1!, c2!, c3!, b);

    await send(owner, remove(a.id));

    expect(await liveChildren(doc, null)).toEqual([c1!.id, c2!.id, c3!.id, b.id]);
    expect(await rowOf(a.id)).toMatchObject({ deleted_root_id: a.id });
    const changes = await changesOf(owner);
    expect(changes).toContainEqual({ entity: "outlineNode", entityId: a.id, op: "delete" });
    for (const child of [c1!, c2!, c3!]) {
      expect(changes).toContainEqual(
        expect.objectContaining({
          entityId: child.id,
          op: "upsert",
          data: expect.objectContaining({ parentId: null }),
        }),
      );
    }
  });

  it("[outline-node#AC-11] deletes the node of a deleted highlight and promotes its children", async () => {
    const owner = newId();
    const doc = newDocument();
    const highlightId = newId();
    const node = nodeIn(doc, { highlightId, role: null, text: null });
    const child = nodeIn(doc, { parentId: node.id, position: "a0" });
    await store(owner, node, child);

    await withUser(db, owner, (tx) =>
      events.publish(tx, {
        type: "annotation.highlightDeleted",
        ownerId: owner,
        highlightId,
        rootId: highlightId,
      }),
    );

    expect(await rowOf(node.id)).toMatchObject({ deleted_root_id: highlightId });
    expect(await liveChildren(doc, null)).toEqual([child.id]);
    const changes = await changesOf(owner);
    expect(changes).toContainEqual({ entity: "outlineNode", entityId: node.id, op: "delete" });
  });

  it("[outline-node#AC-11] deletes every node of a deleted document and nothing else", async () => {
    const owner = newId();
    const [doc, other] = [newDocument(), newDocument()];
    const earlier = nodeIn(doc);
    const [a, b] = [nodeIn(doc), nodeIn(doc, { position: "a1" })];
    const untouched = nodeIn(other);
    await store(owner, earlier, a, b, untouched);
    await send(owner, remove(earlier.id));

    await withUser(db, owner, (tx) =>
      events.publish(tx, {
        type: "library.documentDeleted",
        ownerId: owner,
        documentId: doc,
        rootId: doc,
      }),
    );

    expect(await liveChildren(doc, null)).toEqual([]);
    expect(await rowOf(a.id)).toMatchObject({ deleted_root_id: doc });
    expect(await rowOf(b.id)).toMatchObject({ deleted_root_id: doc });
    expect(await rowOf(earlier.id)).toMatchObject({ deleted_root_id: earlier.id });
    expect(await liveChildren(other, null)).toEqual([untouched.id]);
    const changes = await changesOf(owner);
    expect(changes).toContainEqual({ entity: "outlineNode", entityId: a.id, op: "delete" });
    expect(changes).toContainEqual({ entity: "outlineNode", entityId: b.id, op: "delete" });
  });
});

describe("outline trash", () => {
  it("[outline-node#AC-13] lists a deleted node with its text and restores it at its old place", async () => {
    const owner = newId();
    const doc = newDocument();
    const parent = nodeIn(doc, { role: "TOPIC" });
    const written = nodeIn(doc, { parentId: parent.id, position: "a4", text: "definição de TCP" });
    const fromHighlight = nodeIn(doc, {
      parentId: parent.id,
      position: "a5",
      role: null,
      text: null,
      highlightId: newId(),
    });
    await store(owner, parent, written, fromHighlight);
    await send(owner, remove(written.id));
    await send(owner, remove(fromHighlight.id));

    const items = await trash.list(db, owner);
    await trash.restore(db, owner, written.id);

    expect(items.map((i) => [i.entity, i.id, i.label]).sort()).toEqual(
      [
        ["outlineNode", written.id, "definição de TCP"],
        ["outlineNode", fromHighlight.id, ""],
      ].sort(),
    );
    expect(await rowOf(written.id)).toMatchObject({
      parent_id: parent.id,
      position: "a4",
      deleted_at: null,
    });
    expect(await rowOf(fromHighlight.id)).toMatchObject({ deleted_root_id: fromHighlight.id });
  });

  it("[outline-node#AC-13] restores all nodes of a deleted document through the document's root", async () => {
    const owner = newId();
    const doc = newDocument();
    const [a, b] = [nodeIn(doc), nodeIn(doc, { position: "a1" })];
    await store(owner, a, b);
    await withUser(db, owner, (tx) =>
      events.publish(tx, {
        type: "library.documentDeleted",
        ownerId: owner,
        documentId: doc,
        rootId: doc,
      }),
    );

    await trash.restore(db, owner, doc);

    expect(await liveChildren(doc, null)).toEqual([a.id, b.id]);
  });

  it("[outline-node#AC-13] refuses to restore a node whose parent or document is not live", async () => {
    const owner = newId();
    const doc = newDocument();
    const parent = nodeIn(doc);
    const child = nodeIn(doc, { parentId: parent.id });
    const solo = nodeIn(doc, { position: "a9" });
    await store(owner, parent, child, solo);
    await send(owner, remove(child.id));
    await send(owner, remove(parent.id));
    await send(owner, remove(solo.id));
    liveDocuments.delete(doc);

    await expect(trash.restore(db, owner, child.id)).rejects.toThrow(
      expect.objectContaining({ code: "PARENT_DELETED" }),
    );
    await expect(trash.restore(db, owner, solo.id)).rejects.toThrow(
      expect.objectContaining({ code: "PARENT_DELETED" }),
    );
    expect((await rowOf(child.id))?.deleted_at).not.toBeNull();
    expect((await rowOf(solo.id))?.deleted_at).not.toBeNull();

    liveDocuments.add(doc);
    await trash.restore(db, owner, parent.id);
    await trash.restore(db, owner, child.id);
    expect((await rowOf(child.id))?.deleted_at).toBeNull();
  });
});

describe("outline storage", () => {
  it("orders positions in SQL the way fractional-indexing does, as bytes", async () => {
    const owner = newId();
    const doc = newDocument();
    const keys = ["a1", "Zz", "a0V", "a0"];
    for (const position of keys) {
      await admin.query(
        `insert into outline.nodes (id, owner_id, document_id, position, role, text) values ($1, $2, $3, $4, 'ITEM', 'x')`,
        [newId(), owner, doc, position],
      );
    }

    const { rows } = await admin.query<{ position: string }>(
      `select position from outline.nodes where document_id = $1 order by position`,
      [doc],
    );

    expect(rows.map((r) => r.position)).toEqual(["Zz", "a0", "a0V", "a1"]);
  });
});
