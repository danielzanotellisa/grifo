import {
  createOutlineSyncHandler,
  createOutlineTrashParticipant,
  nodeSource,
  registerOutlineReactions,
} from "@app/outline";
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
import { createFlashcardSyncHandler } from "./flashcard-sync";
import { createFlashcardTrashParticipant } from "./flashcard-trash";
import { registerStudyReactions } from "./reactions";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const liveDocuments = new Set<string>();
const documentIsLive = async (_tx: unknown, _owner: string, id: string) => liveDocuments.has(id);

const events = createInProcessEventBus();
registerOutlineReactions(events);
registerStudyReactions(events);
const engine = createSyncEngine([
  createOutlineSyncHandler({ documentIsLive }),
  createFlashcardSyncHandler({ nodeSource }),
]);
const trash = createTrash([
  createFlashcardTrashParticipant({ documentIsLive }),
  createOutlineTrashParticipant({ documentIsLive }),
]);

const mutation = (entity: string, op: "upsert" | "delete", data: unknown): Mutation => ({
  mutationId: newId(),
  entity,
  op,
  data,
});
const send = async (owner: string, m: Mutation) => (await engine.push(db, owner, [m])).results[0]!;
const rejected = (code: string) => expect.objectContaining({ status: "rejected", code });
const changesOf = async (owner: string) => (await engine.pull(db, owner, 0)).changes;

const newDocument = () => {
  const id = newId();
  liveDocuments.add(id);
  return id;
};
const newNode = async (
  owner: string,
  documentId: string,
  role: "TOPIC" | "DEFINITION" | "ITEM" = "DEFINITION",
  text = "protocolo orientado a conexão",
) => {
  const id = newId();
  const data = { id, documentId, parentId: null, position: "a0", highlightId: null, role, text };
  expect((await send(owner, mutation("outlineNode", "upsert", data))).status).toBe("applied");
  return { id, data };
};
const createCard = (owner: string, id: string, sourceNodeId: string, front = "TCP") =>
  send(owner, mutation("flashcard", "upsert", { id, sourceNodeId, front }));
const makeCard = async (owner: string, sourceNodeId: string, front = "TCP") => {
  const id = newId();
  expect((await createCard(owner, id, sourceNodeId, front)).status).toBe("applied");
  return id;
};
const editCard = (owner: string, id: string, front: string, back: string) =>
  send(owner, mutation("flashcard", "upsert", { id, front, back }));
const refreshCard = (owner: string, id: string) =>
  send(owner, mutation("flashcard", "upsert", { id, refreshFromSource: true }));
const deleteCard = (owner: string, id: string) =>
  send(owner, mutation("flashcard", "delete", { id }));

type CardRow = {
  document_id: string;
  source_node_id: string | null;
  front: string;
  back: string;
  deleted_at: Date | null;
  deleted_root_id: string | null;
};
const cardRow = async (id: string) =>
  (
    await admin.query<CardRow>(
      `select document_id, source_node_id, front, back, deleted_at, deleted_root_id from study.flashcards where id = $1`,
      [id],
    )
  ).rows[0];

describe("flashcard create", () => {
  it("[flashcard#AC-11][flashcard#AC-4] takes the document and the trimmed text from the node", async () => {
    const owner = newId();
    const doc = newDocument();
    const node = await newNode(owner, doc, "DEFINITION", "  protocolo orientado a conexão  ");
    const id = newId();

    expect((await createCard(owner, id, node.id, "  TCP  ")).status).toBe("applied");

    expect(await cardRow(id)).toMatchObject({
      document_id: doc,
      source_node_id: node.id,
      front: "TCP",
      back: "protocolo orientado a conexão",
      deleted_at: null,
    });
    expect((await changesOf(owner)).find((c) => c.entity === "flashcard")).toEqual({
      entity: "flashcard",
      entityId: id,
      op: "upsert",
      data: {
        id,
        documentId: doc,
        sourceNodeId: node.id,
        front: "TCP",
        back: "protocolo orientado a conexão",
      },
    });
  });

  it("[flashcard#AC-11][flashcard#AC-1] refuses a node that is not a DEFINITION", async () => {
    const owner = newId();
    const doc = newDocument();
    const [item, topic] = [await newNode(owner, doc, "ITEM"), await newNode(owner, doc, "TOPIC")];

    for (const node of [item, topic]) {
      const id = newId();
      expect(await createCard(owner, id, node.id)).toEqual(
        rejected("FLASHCARD_REQUIRES_DEFINITION"),
      );
      expect(await cardRow(id)).toBeUndefined();
    }
  });

  it("[flashcard#AC-11] refuses a node that is deleted or missing", async () => {
    const owner = newId();
    const doc = newDocument();
    const gone = await newNode(owner, doc);
    await send(owner, mutation("outlineNode", "delete", { id: gone.id }));

    for (const sourceNodeId of [gone.id, newId()]) {
      const id = newId();
      expect(await createCard(owner, id, sourceNodeId)).toEqual(rejected("PARENT_DELETED"));
      expect(await cardRow(id)).toBeUndefined();
    }
  });

  it("[flashcard#AC-5] refuses a blank front", async () => {
    const owner = newId();
    const node = await newNode(owner, newDocument());
    const id = newId();

    expect(await createCard(owner, id, node.id, "   ")).toEqual(
      rejected("FLASHCARD_FRONT_REQUIRED"),
    );
    expect(await cardRow(id)).toBeUndefined();
  });
});

describe("flashcard shapes and ownership", () => {
  it("[flashcard#AC-12] refuses malformed or mixed data and a create for an id that already has a card", async () => {
    const owner = newId();
    const node = await newNode(owner, newDocument());
    const id = await makeCard(owner, node.id);
    const bad = [
      { id: newId(), front: "x" },
      { id: newId(), sourceNodeId: node.id, front: "x", extra: 1 },
      { id, front: "x", back: "y", refreshFromSource: true },
      { id, refreshFromSource: false },
      { id: "nope", sourceNodeId: node.id, front: "x" },
      { id, sourceNodeId: node.id, front: "outra frente" },
    ];

    for (const data of bad) {
      expect(await send(owner, mutation("flashcard", "upsert", data))).toEqual(
        rejected("FLASHCARD_INVALID"),
      );
    }
    expect((await cardRow(id))?.front).toBe("TCP");
  });

  it("[flashcard#AC-12] answers NOT_FOUND for a missing, deleted or foreign card", async () => {
    const [alice, bob] = [newId(), newId()];
    const node = await newNode(alice, newDocument());
    const card = await makeCard(alice, node.id);
    const bobNode = await newNode(bob, newDocument());
    const dead = await makeCard(alice, node.id, "removida");
    await deleteCard(alice, dead);

    for (const id of [newId(), dead]) {
      expect(await editCard(alice, id, "x", "y")).toEqual(rejected("NOT_FOUND"));
      expect(await refreshCard(alice, id)).toEqual(rejected("NOT_FOUND"));
      expect(await deleteCard(alice, id)).toEqual(rejected("NOT_FOUND"));
    }
    expect(await createCard(alice, dead, node.id)).toEqual(rejected("NOT_FOUND"));
    expect(await editCard(bob, card, "do Bob", "do Bob")).toEqual(rejected("NOT_FOUND"));
    expect(await refreshCard(bob, card)).toEqual(rejected("NOT_FOUND"));
    expect(await deleteCard(bob, card)).toEqual(rejected("NOT_FOUND"));
    expect(await createCard(bob, card, bobNode.id)).toEqual(rejected("NOT_FOUND"));
    expect(await cardRow(card)).toMatchObject({ front: "TCP", deleted_at: null });
  });
});

describe("flashcard edit and update from source", () => {
  it("[flashcard#AC-6] sets the trimmed front and back", async () => {
    const owner = newId();
    const node = await newNode(owner, newDocument());
    const id = await makeCard(owner, node.id);

    expect((await editCard(owner, id, " UDP ", " sem conexão ")).status).toBe("applied");
    expect(await editCard(owner, id, " ", "x")).toEqual(rejected("FLASHCARD_FRONT_REQUIRED"));
    expect(await editCard(owner, id, "x", "  ")).toEqual(rejected("FLASHCARD_BACK_EMPTY"));

    expect(await cardRow(id)).toMatchObject({ front: "UDP", back: "sem conexão" });
  });

  it("[flashcard#AC-2][flashcard#AC-7] keeps the back when the node text changes, until the user asks to update", async () => {
    const owner = newId();
    const doc = newDocument();
    const node = await newNode(owner, doc, "DEFINITION", "texto original");
    const id = await makeCard(owner, node.id, "Termo");

    await send(
      owner,
      mutation("outlineNode", "upsert", { ...node.data, text: "  texto editado  " }),
    );
    expect((await cardRow(id))?.back).toBe("texto original");

    expect((await refreshCard(owner, id)).status).toBe("applied");
    expect(await cardRow(id)).toMatchObject({ front: "Termo", back: "texto editado" });
  });
});

describe("flashcard source", () => {
  it("[flashcard#AC-13][flashcard#AC-8] stays live while its node is deleted and updates again once it is restored", async () => {
    const owner = newId();
    const doc = newDocument();
    const node = await newNode(owner, doc, "DEFINITION", "texto do nó");
    const id = await makeCard(owner, node.id);
    await send(owner, mutation("outlineNode", "delete", { id: node.id }));

    expect(await refreshCard(owner, id)).toEqual(rejected("FLASHCARD_SOURCE_GONE"));
    expect(await cardRow(id)).toMatchObject({ source_node_id: node.id, deleted_at: null });

    await trash.restore(db, owner, node.id);
    expect((await refreshCard(owner, id)).status).toBe("applied");
    expect((await cardRow(id))?.back).toBe("texto do nó");
  });
});

describe("flashcard cascade and trash", () => {
  it("[flashcard#AC-14] deletes the cards of a deleted document and brings them back with it", async () => {
    const owner = newId();
    const doc = newDocument();
    const node = await newNode(owner, doc);
    const [a, b] = [await makeCard(owner, node.id, "A"), await makeCard(owner, node.id, "B")];
    const earlier = await makeCard(owner, node.id, "antes");
    await deleteCard(owner, earlier);

    await withUser(db, owner, (tx) =>
      events.publish(tx, {
        type: "library.documentDeleted",
        ownerId: owner,
        documentId: doc,
        rootId: doc,
      }),
    );

    expect(await cardRow(a)).toMatchObject({ deleted_root_id: doc });
    expect(await cardRow(b)).toMatchObject({ deleted_root_id: doc });
    expect(await cardRow(earlier)).toMatchObject({ deleted_root_id: earlier });
    const changes = await changesOf(owner);
    expect(changes).toContainEqual({ entity: "flashcard", entityId: a, op: "delete" });
    expect(changes).toContainEqual({ entity: "flashcard", entityId: b, op: "delete" });

    await trash.restore(db, owner, doc);
    expect(await cardRow(a)).toMatchObject({ deleted_at: null });
    expect(await cardRow(b)).toMatchObject({ deleted_at: null });
    expect((await cardRow(earlier))?.deleted_at).not.toBeNull();
  });

  it("[flashcard#AC-15][flashcard#AC-9] lists a deleted card with its front, restores it, and needs its document", async () => {
    const owner = newId();
    const doc = newDocument();
    const node = await newNode(owner, doc);
    const id = await makeCard(owner, node.id, "Segmento");
    await deleteCard(owner, id);

    const items = (await trash.list(db, owner)).filter((i) => i.entity === "flashcard");
    liveDocuments.delete(doc);
    await expect(trash.restore(db, owner, id)).rejects.toThrow(
      expect.objectContaining({ code: "PARENT_DELETED" }),
    );
    expect((await cardRow(id))?.deleted_at).not.toBeNull();

    liveDocuments.add(doc);
    await trash.restore(db, owner, id);

    expect(items.map((i) => [i.id, i.label])).toEqual([[id, "Segmento"]]);
    expect(await cardRow(id)).toMatchObject({ deleted_at: null, deleted_root_id: null });
  });
});
