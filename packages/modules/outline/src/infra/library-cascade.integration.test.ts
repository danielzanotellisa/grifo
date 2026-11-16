import {
  createInProcessEventBus,
  createSyncEngine,
  createTrash,
  newId,
  type Db,
  type Mutation,
} from "@app/platform";
import {
  createDocumentSyncHandler,
  createSubjectSyncHandler,
  documentIsLive,
  documentTrashParticipant,
  subjectTrashParticipant,
} from "@app/library";
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

// The real wiring of two modules, as the composition root does it.
const events = createInProcessEventBus();
registerOutlineReactions(events);
const engine = createSyncEngine([
  createSubjectSyncHandler({ events }),
  createDocumentSyncHandler({ events }),
  createOutlineSyncHandler({ documentIsLive }),
]);
const trash = createTrash([
  subjectTrashParticipant,
  documentTrashParticipant,
  createOutlineTrashParticipant({ documentIsLive }),
]);

const send = async (owner: string, mutation: Mutation) =>
  (await engine.push(db, owner, [mutation])).results[0]!;
const mutation = (entity: string, op: "upsert" | "delete", data: unknown): Mutation => ({
  mutationId: newId(),
  entity,
  op,
  data,
});

const seedDocument = async (owner: string, subjectId: string) => {
  const [fileId, id] = [newId(), newId()];
  await admin.query(
    `insert into library.stored_files (id, owner_id, sha256, size_bytes, storage_key) values ($1, $2, $3, 10, $4)`,
    [fileId, owner, fileId.replaceAll("-", "").padEnd(64, "0"), `${owner}/${fileId}.pdf`],
  );
  await admin.query(
    `insert into library.documents (id, owner_id, subject_id, stored_file_id, title, status) values ($1, $2, $3, $4, 'doc', 'READY')`,
    [id, owner, subjectId, fileId],
  );
  return id;
};

const liveNodes = async (documentId: string) =>
  (
    await admin.query<{ id: string }>(
      `select id from outline.nodes where document_id = $1 and deleted_at is null order by position`,
      [documentId],
    )
  ).rows.map((r) => r.id);

describe("library and outline together", () => {
  it("[subject#AC-1] takes the outline nodes of every document with a deleted subject and brings them back", async () => {
    const owner = newId();
    const subject = newId();
    await send(owner, mutation("subject", "upsert", { id: subject, name: "Redes" }));
    const docs = [await seedDocument(owner, subject), await seedDocument(owner, subject)];
    const nodes = new Map<string, string[]>();
    for (const documentId of docs) {
      const ids = [newId(), newId()];
      nodes.set(documentId, ids);
      for (const [i, id] of ids.entries()) {
        const data = {
          id,
          documentId,
          parentId: null,
          position: `a${i}`,
          highlightId: null,
          role: "ITEM",
          text: "x",
        };
        expect((await send(owner, mutation("outlineNode", "upsert", data))).status).toBe("applied");
      }
    }

    await send(owner, mutation("subject", "delete", { id: subject }));
    for (const documentId of docs) expect(await liveNodes(documentId)).toEqual([]);

    await trash.restore(db, owner, subject);
    for (const documentId of docs)
      expect(await liveNodes(documentId)).toEqual(nodes.get(documentId));
  });

  it("rejects a node for a document that was deleted with its subject", async () => {
    const owner = newId();
    const subject = newId();
    await send(owner, mutation("subject", "upsert", { id: subject, name: "Redes" }));
    const documentId = await seedDocument(owner, subject);
    await send(owner, mutation("subject", "delete", { id: subject }));

    const data = {
      id: newId(),
      documentId,
      parentId: null,
      position: "a0",
      highlightId: null,
      role: "ITEM",
      text: "x",
    };

    expect(await send(owner, mutation("outlineNode", "upsert", data))).toEqual({
      mutationId: expect.any(String),
      status: "rejected",
      code: "PARENT_DELETED",
    });
  });
});
