import {
  createAnnotationSyncHandlers,
  categoryTrashParticipant,
  createHighlightTrashParticipant,
  registerAnnotationReactions,
} from "@app/annotation";
import {
  createInProcessEventBus,
  createSyncEngine,
  createTrash,
  newId,
  outlineNodeIdForHighlight,
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

const documents = new Map<string, { status: string; pageCount: number | null }>();
const documentState = async (_tx: unknown, _owner: string, id: string) => documents.get(id) ?? null;
const documentIsLive = async (_tx: unknown, _owner: string, id: string) => documents.has(id);

const events = createInProcessEventBus();
registerAnnotationReactions(events);
registerOutlineReactions(events);
const engine = createSyncEngine([
  ...createAnnotationSyncHandlers({ events, documentState }),
  createOutlineSyncHandler({ documentIsLive }),
]);
const trash = createTrash([
  createHighlightTrashParticipant({ documentState }),
  categoryTrashParticipant,
  createOutlineTrashParticipant({ documentIsLive }),
]);

const mutation = (entity: string, op: "upsert" | "delete", data: unknown): Mutation => ({
  mutationId: newId(),
  entity,
  op,
  data,
});
const send = async (owner: string, m: Mutation) => (await engine.push(db, owner, [m])).results[0]!;
const expectApplied = async (owner: string, m: Mutation) =>
  expect((await send(owner, m)).status).toBe("applied");

let counter = 0;
const newCategory = async (
  owner: string,
  role: "TOPIC" | "DEFINITION" | "ITEM" | "IGNORE" = "ITEM",
) => {
  const id = newId();
  counter += 1;
  await expectApplied(
    owner,
    mutation("category", "upsert", {
      id,
      name: `Cat ${counter}`,
      color: "#4F8EF7",
      role,
      shortcut: null,
      position: `a${counter}`,
    }),
  );
  return id;
};
const newDocument = () => {
  const id = newId();
  documents.set(id, { status: "READY", pageCount: 20 });
  return id;
};

type Rect = { x1: number; y1: number; x2: number; y2: number };
const highlightData = (
  documentId: string,
  categoryId: string,
  over: { pageIndex?: number; rects?: Rect[]; id?: string } = {},
) => ({
  id: over.id ?? newId(),
  documentId,
  categoryId,
  pageIndex: over.pageIndex ?? 0,
  rects: over.rects ?? [{ x1: 10, y1: 700, x2: 200, y2: 712 }],
  quote: { exact: "texto marcado", prefix: "", suffix: "" },
  note: null,
});
const addHighlight = async (owner: string, data: ReturnType<typeof highlightData>) => {
  await expectApplied(owner, mutation("highlight", "upsert", data));
  return data;
};
const nodeData = (documentId: string, over: Record<string, unknown> = {}) => ({
  id: newId(),
  documentId,
  parentId: null,
  position: "a5",
  highlightId: null,
  role: "ITEM",
  text: "texto livre",
  ...over,
});

type NodeRow = {
  id: string;
  document_id: string;
  parent_id: string | null;
  position: string;
  highlight_id: string | null;
  role: string | null;
  text: string | null;
  deleted_at: Date | null;
  deleted_root_id: string | null;
};
const nodeRow = async (id: string) =>
  (await admin.query<NodeRow>(`select * from outline.nodes where id = $1`, [id])).rows[0];
const nodesOfHighlight = async (highlightId: string) =>
  (await admin.query<NodeRow>(`select * from outline.nodes where highlight_id = $1`, [highlightId]))
    .rows;
const rootOrder = async (documentId: string) =>
  (
    await admin.query<{ highlight_id: string | null; id: string }>(
      `select id, highlight_id from outline.nodes
        where document_id = $1 and parent_id is null and deleted_at is null order by position`,
      [documentId],
    )
  ).rows;

describe("the node of a highlight", () => {
  it("[highlight#AC-6][outline-node#AC-15] is created with the derived id, and not for an IGNORE category", async () => {
    const owner = newId();
    const doc = newDocument();
    const [item, ignore] = [await newCategory(owner), await newCategory(owner, "IGNORE")];

    const marked = await addHighlight(owner, highlightData(doc, item));
    const hidden = await addHighlight(owner, highlightData(doc, ignore));

    expect(await nodeRow(outlineNodeIdForHighlight(marked.id))).toMatchObject({
      document_id: doc,
      parent_id: null,
      highlight_id: marked.id,
      role: null,
      text: null,
      deleted_at: null,
    });
    expect(await nodesOfHighlight(hidden.id)).toEqual([]);
  });

  it("[outline-node#AC-15] stays a single node when the client sends it before or after the highlight", async () => {
    const owner = newId();
    const doc = newDocument();
    const category = await newCategory(owner);
    const [early, late] = [highlightData(doc, category), highlightData(doc, category)];
    const clientNode = (h: typeof early, text: string | null) =>
      nodeData(doc, {
        id: outlineNodeIdForHighlight(h.id),
        highlightId: h.id,
        role: null,
        text,
        position: "a0",
      });

    await expectApplied(owner, mutation("outlineNode", "upsert", clientNode(early, "do cliente")));
    await addHighlight(owner, early);
    await addHighlight(owner, late);
    await expectApplied(
      owner,
      mutation("outlineNode", "upsert", clientNode(late, "editado depois")),
    );

    expect(await nodesOfHighlight(early.id)).toHaveLength(1);
    expect((await nodesOfHighlight(early.id))[0]).toMatchObject({
      text: "do cliente",
      position: "a0",
    });
    expect(await nodesOfHighlight(late.id)).toHaveLength(1);
    expect((await nodesOfHighlight(late.id))[0]).toMatchObject({ text: "editado depois" });
  });

  it("[outline-node#AC-16] goes to the root in page, then top-to-bottom, then left-to-right order", async () => {
    const owner = newId();
    const doc = newDocument();
    const category = await newCategory(owner);
    await expectApplied(
      owner,
      mutation("outlineNode", "upsert", nodeData(doc, { position: "a0", text: "livre" })),
    );
    const at = (pageIndex: number, top: number, left: number) =>
      highlightData(doc, category, {
        pageIndex,
        rects: [{ x1: left, y1: top - 12, x2: left + 100, y2: top }],
      });
    const page3 = await addHighlight(owner, at(3, 400, 10));
    const page1 = await addHighlight(owner, at(1, 400, 10));
    const page2Low = await addHighlight(owner, at(2, 100, 10));
    const page2High = await addHighlight(owner, at(2, 600, 10));
    const page2HighRight = await addHighlight(owner, at(2, 600, 300));
    const page2HighLeft = await addHighlight(owner, at(2, 600, 5));

    const order = (await rootOrder(doc)).map((n) => n.highlight_id).filter(Boolean);

    expect(order).toEqual([
      page1.id,
      page2HighLeft.id,
      page2High.id,
      page2HighRight.id,
      page2Low.id,
      page3.id,
    ]);
  });

  it("[highlight#AC-10] is deleted with its highlight and its children are promoted", async () => {
    const owner = newId();
    const doc = newDocument();
    const category = await newCategory(owner);
    const marked = await addHighlight(owner, highlightData(doc, category));
    const nodeId = outlineNodeIdForHighlight(marked.id);
    const child = nodeData(doc, { parentId: nodeId, position: "a0" });
    await expectApplied(owner, mutation("outlineNode", "upsert", child));

    await expectApplied(owner, mutation("highlight", "delete", { id: marked.id }));

    expect(await nodeRow(nodeId)).toMatchObject({ deleted_root_id: marked.id });
    expect(await nodeRow(child.id)).toMatchObject({ parent_id: null, deleted_at: null });
  });

  it("[highlight#AC-5][outline-node#AC-18] leaves the outline when the category becomes IGNORE and comes back", async () => {
    const owner = newId();
    const doc = newDocument();
    const category = newId();
    const catData = {
      id: category,
      name: "Mutável",
      color: "#4F8EF7",
      role: "ITEM",
      shortcut: null,
      position: "a1",
    };
    await expectApplied(owner, mutation("category", "upsert", catData));
    const marked = await addHighlight(owner, highlightData(doc, category));
    const nodeId = outlineNodeIdForHighlight(marked.id);
    const child = nodeData(doc, { parentId: nodeId, position: "a0" });
    await expectApplied(owner, mutation("outlineNode", "upsert", child));

    await expectApplied(owner, mutation("category", "upsert", { ...catData, role: "IGNORE" }));
    expect(await nodeRow(nodeId)).toMatchObject({ deleted_root_id: marked.id });
    expect(await nodeRow(child.id)).toMatchObject({ parent_id: null, deleted_at: null });
    expect((await trash.list(db, owner)).map((i) => i.id)).not.toContain(nodeId);

    await expectApplied(owner, mutation("category", "upsert", { ...catData, role: "DEFINITION" }));
    expect(await nodeRow(nodeId)).toMatchObject({ deleted_at: null, deleted_root_id: null });
    expect(await nodesOfHighlight(marked.id)).toHaveLength(1);
  });

  it("[outline-node#AC-18] stays deleted when the user deleted it directly", async () => {
    const owner = newId();
    const doc = newDocument();
    const [item, ignore] = [await newCategory(owner), await newCategory(owner, "IGNORE")];
    const marked = await addHighlight(owner, highlightData(doc, item));
    const nodeId = outlineNodeIdForHighlight(marked.id);
    await expectApplied(owner, mutation("outlineNode", "delete", { id: nodeId }));

    await addHighlightMove(owner, marked, ignore);
    await addHighlightMove(owner, marked, item);

    expect(await nodeRow(nodeId)).toMatchObject({ deleted_root_id: nodeId });
  });

  it("[highlight#AC-13] adds and removes the node when the highlight itself changes category across IGNORE", async () => {
    const owner = newId();
    const doc = newDocument();
    const [item, ignore] = [await newCategory(owner), await newCategory(owner, "IGNORE")];
    const marked = await addHighlight(owner, highlightData(doc, ignore));
    const nodeId = outlineNodeIdForHighlight(marked.id);
    expect(await nodeRow(nodeId)).toBeUndefined();

    await addHighlightMove(owner, marked, item);
    expect(await nodeRow(nodeId)).toMatchObject({ deleted_at: null });

    await addHighlightMove(owner, marked, ignore);
    expect(await nodeRow(nodeId)).toMatchObject({ deleted_root_id: marked.id });
  });

  it("[highlight#AC-12] comes back with its highlight when the highlight is restored", async () => {
    const owner = newId();
    const doc = newDocument();
    const category = await newCategory(owner);
    const marked = await addHighlight(owner, highlightData(doc, category));
    const nodeId = outlineNodeIdForHighlight(marked.id);
    await expectApplied(owner, mutation("highlight", "delete", { id: marked.id }));

    await trash.restore(db, owner, marked.id);

    expect(await nodeRow(nodeId)).toMatchObject({ deleted_at: null, deleted_root_id: null });
  });

  it("[outline-node#AC-17] is put at the end of the root when its parent was deleted meanwhile", async () => {
    const owner = newId();
    const doc = newDocument();
    const category = await newCategory(owner);
    const parent = nodeData(doc, { position: "a1", text: "pai" });
    const lastRoot = nodeData(doc, { position: "a8", text: "último" });
    await expectApplied(owner, mutation("outlineNode", "upsert", parent));
    await expectApplied(owner, mutation("outlineNode", "upsert", lastRoot));
    const marked = await addHighlight(owner, highlightData(doc, category));
    const nodeId = outlineNodeIdForHighlight(marked.id);
    await expectApplied(
      owner,
      mutation(
        "outlineNode",
        "upsert",
        nodeData(doc, {
          id: nodeId,
          parentId: parent.id,
          highlightId: marked.id,
          role: null,
          text: null,
          position: "a0",
        }),
      ),
    );
    await expectApplied(owner, mutation("highlight", "delete", { id: marked.id }));
    await expectApplied(owner, mutation("outlineNode", "delete", { id: parent.id }));

    await trash.restore(db, owner, marked.id);

    const restored = await nodeRow(nodeId);
    expect(restored).toMatchObject({ parent_id: null, deleted_at: null });
    expect(restored!.position > "a8").toBe(true);
    expect((await nodeRow(parent.id))?.deleted_at).not.toBeNull();
  });

  it("[outline-node#AC-17] is put at the root when it returns from IGNORE under a deleted parent", async () => {
    const owner = newId();
    const doc = newDocument();
    const [item, ignore] = [await newCategory(owner), await newCategory(owner, "IGNORE")];
    const parent = nodeData(doc, { position: "a1" });
    await expectApplied(owner, mutation("outlineNode", "upsert", parent));
    const marked = await addHighlight(owner, highlightData(doc, item));
    const nodeId = outlineNodeIdForHighlight(marked.id);
    await expectApplied(
      owner,
      mutation(
        "outlineNode",
        "upsert",
        nodeData(doc, {
          id: nodeId,
          parentId: parent.id,
          highlightId: marked.id,
          role: null,
          text: null,
          position: "a0",
        }),
      ),
    );
    await addHighlightMove(owner, marked, ignore);
    await expectApplied(owner, mutation("outlineNode", "delete", { id: parent.id }));

    await addHighlightMove(owner, marked, item);

    expect(await nodeRow(nodeId)).toMatchObject({ parent_id: null, deleted_at: null });
  });
});

async function addHighlightMove(
  owner: string,
  h: ReturnType<typeof highlightData>,
  categoryId: string,
) {
  await expectApplied(owner, mutation("highlight", "upsert", { ...h, categoryId }));
}

describe("deleting a document", () => {
  it("[highlight#AC-11] takes the highlights and the nodes of the document", async () => {
    const owner = newId();
    const doc = newDocument();
    const category = await newCategory(owner);
    const marked = await addHighlight(owner, highlightData(doc, category));

    await withUser(db, owner, (tx) =>
      events.publish(tx, {
        type: "library.documentDeleted",
        ownerId: owner,
        documentId: doc,
        rootId: doc,
      }),
    );

    expect(
      (
        await admin.query(`select deleted_root_id from annotation.highlights where id = $1`, [
          marked.id,
        ])
      ).rows[0],
    ).toEqual({
      deleted_root_id: doc,
    });
    expect(await nodeRow(outlineNodeIdForHighlight(marked.id))).toMatchObject({
      deleted_root_id: doc,
    });
  });
});
