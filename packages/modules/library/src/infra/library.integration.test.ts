import {
  createInProcessEventBus,
  createSyncEngine,
  createTrash,
  newId,
  type Db,
  type Mutation,
} from "@app/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { documentIsLive } from "./document-liveness";
import { createDocumentSyncHandler } from "./document-sync";
import { createSubjectSyncHandler } from "./subject-sync";
import { documentTrashParticipant, subjectTrashParticipant } from "./trash";
import { withUser } from "@app/platform";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

type DocumentDeleted = { ownerId: string; documentId: string; rootId: string };
const deletedEvents: DocumentDeleted[] = [];
const events = createInProcessEventBus();
events.subscribe("library.documentDeleted", async (_tx, event) => {
  deletedEvents.push(event);
});

const engine = createSyncEngine([
  createSubjectSyncHandler({ events }),
  createDocumentSyncHandler({ events }),
]);
const trash = createTrash([subjectTrashParticipant, documentTrashParticipant]);

const subjectMutation = (op: "upsert" | "delete", data: unknown): Mutation => ({
  mutationId: newId(),
  entity: "subject",
  op,
  data,
});
const documentMutation = (op: "upsert" | "delete", data: unknown): Mutation => ({
  mutationId: newId(),
  entity: "document",
  op,
  data,
});
const send = async (owner: string, mutation: Mutation) =>
  (await engine.push(db, owner, [mutation])).results[0]!;
const rejected = (code: string) => expect.objectContaining({ status: "rejected", code });
const changesOf = async (owner: string) => (await engine.pull(db, owner, 0)).changes;

const addSubject = async (owner: string, name = "Redes") => {
  const id = newId();
  expect((await send(owner, subjectMutation("upsert", { id, name }))).status).toBe("applied");
  return id;
};

/** Documents are created by the upload, not by sync, so the tests seed them directly. */
const seedDocument = async (owner: string, subjectId: string, title = "TCP") => {
  const [fileId, id] = [newId(), newId()];
  await admin.query(
    `insert into library.stored_files (id, owner_id, sha256, size_bytes, storage_key)
     values ($1, $2, $3, 10, $4)`,
    [fileId, owner, fileId.replaceAll("-", "").padEnd(64, "0"), `${owner}/${fileId}.pdf`],
  );
  await admin.query(
    `insert into library.documents (id, owner_id, subject_id, stored_file_id, title, status, page_count)
     values ($1, $2, $3, $4, $5, 'READY', 12)`,
    [id, owner, subjectId, fileId, title],
  );
  return id;
};

type DocRow = {
  subject_id: string;
  title: string;
  status: string;
  page_count: number;
  stored_file_id: string;
  deleted_at: Date | null;
  deleted_root_id: string | null;
};
const docRow = async (id: string) =>
  (
    await admin.query<DocRow>(
      `select subject_id, title, status, page_count, stored_file_id, deleted_at, deleted_root_id
         from library.documents where id = $1`,
      [id],
    )
  ).rows[0]!;
const subjectRow = async (id: string) =>
  (
    await admin.query<{ name: string; deleted_at: Date | null; deleted_root_id: string | null }>(
      `select name, deleted_at, deleted_root_id from library.subjects where id = $1`,
      [id],
    )
  ).rows[0];

describe("subject sync", () => {
  it("[subject#AC-3] creates and renames a subject with the trimmed name and pulls it back", async () => {
    const owner = newId();
    const id = newId();

    await send(owner, subjectMutation("upsert", { id, name: "  Redes  " }));
    await send(owner, subjectMutation("upsert", { id, name: " Redes de Computadores " }));

    expect((await subjectRow(id))?.name).toBe("Redes de Computadores");
    expect(await changesOf(owner)).toEqual([
      {
        entity: "subject",
        entityId: id,
        op: "upsert",
        data: { id, name: "Redes de Computadores" },
      },
    ]);
  });

  it("[subject#AC-3] rejects a blank or too long name and malformed data", async () => {
    const owner = newId();
    const id = newId();

    for (const name of ["", "   ", "x".repeat(121)]) {
      expect(await send(owner, subjectMutation("upsert", { id, name }))).toEqual(
        rejected("SUBJECT_NAME_INVALID"),
      );
    }
    expect(await send(owner, subjectMutation("upsert", { id, name: "ok", extra: 1 }))).toEqual(
      rejected("SUBJECT_INVALID"),
    );
    expect(await send(owner, subjectMutation("upsert", { name: "ok" }))).toEqual(
      rejected("SUBJECT_INVALID"),
    );
    expect(await subjectRow(id)).toBeUndefined();
  });

  it("accepts a name of exactly 120 characters", async () => {
    const owner = newId();
    const id = newId();

    expect(
      (await send(owner, subjectMutation("upsert", { id, name: "x".repeat(120) }))).status,
    ).toBe("applied");
  });

  it("[subject#AC-4] answers NOT_FOUND for a deleted subject or one of another user", async () => {
    const [alice, bob] = [newId(), newId()];
    const id = await addSubject(alice, "da Alice");

    expect(await send(bob, subjectMutation("upsert", { id, name: "do Bob" }))).toEqual(
      rejected("NOT_FOUND"),
    );
    expect(await send(bob, subjectMutation("delete", { id }))).toEqual(rejected("NOT_FOUND"));
    expect((await subjectRow(id))?.name).toBe("da Alice");

    await send(alice, subjectMutation("delete", { id }));
    expect(await send(alice, subjectMutation("upsert", { id, name: "editado" }))).toEqual(
      rejected("NOT_FOUND"),
    );
    expect(await send(alice, subjectMutation("delete", { id }))).toEqual(rejected("NOT_FOUND"));
    expect((await subjectRow(id))?.name).toBe("da Alice");
  });

  it("[subject#AC-2] deletes the live documents under the subject's root and publishes an event for each", async () => {
    const owner = newId();
    const subject = await addSubject(owner);
    const docs = [await seedDocument(owner, subject), await seedDocument(owner, subject)];
    const earlier = await seedDocument(owner, subject, "earlier");
    await send(owner, documentMutation("delete", { id: earlier }));
    deletedEvents.length = 0;

    await send(owner, subjectMutation("delete", { id: subject }));

    expect((await subjectRow(subject))?.deleted_root_id).toBe(subject);
    for (const id of docs) expect((await docRow(id)).deleted_root_id).toBe(subject);
    expect((await docRow(earlier)).deleted_root_id).toBe(earlier);
    expect(deletedEvents.map((e) => [e.documentId, e.rootId]).sort()).toEqual(
      docs.map((id) => [id, subject]).sort(),
    );
    const changes = await changesOf(owner);
    for (const id of [subject, ...docs]) {
      expect(changes).toContainEqual(expect.objectContaining({ entityId: id, op: "delete" }));
    }
  });

  it("[subject#AC-1] brings the documents back unchanged when the subject is restored", async () => {
    const owner = newId();
    const subject = await addSubject(owner);
    const docs = [
      await seedDocument(owner, subject, "um"),
      await seedDocument(owner, subject, "dois"),
      await seedDocument(owner, subject, "três"),
    ];
    const before = await Promise.all(docs.map(docRow));
    await send(owner, subjectMutation("delete", { id: subject }));

    await trash.restore(db, owner, subject);

    expect(await Promise.all(docs.map(docRow))).toEqual(before);
    expect((await subjectRow(subject))?.deleted_at).toBeNull();
  });

  it("[subject#AC-5] lists a deleted subject with its name, but not the documents deleted with it", async () => {
    const owner = newId();
    const subject = await addSubject(owner, "Redes");
    await seedDocument(owner, subject);
    await send(owner, subjectMutation("delete", { id: subject }));

    const items = await trash.list(db, owner);

    expect(items.map((i) => [i.entity, i.id, i.label])).toEqual([["subject", subject, "Redes"]]);
  });
});

describe("document sync", () => {
  it("[document#AC-4] renames a document with the trimmed title and rejects an invalid one", async () => {
    const owner = newId();
    const subject = await addSubject(owner);
    const id = await seedDocument(owner, subject);

    await send(
      owner,
      documentMutation("upsert", { id, subjectId: subject, title: "  Novo título " }),
    );
    expect((await docRow(id)).title).toBe("Novo título");

    for (const title of ["", "  ", "x".repeat(201)]) {
      expect(
        await send(owner, documentMutation("upsert", { id, subjectId: subject, title })),
      ).toEqual(rejected("DOCUMENT_TITLE_INVALID"));
    }
    expect((await docRow(id)).title).toBe("Novo título");
  });

  it("[document#AC-5] moves a document changing only its subject, if the target subject is live", async () => {
    const owner = newId();
    const [from, to, gone] = [
      await addSubject(owner),
      await addSubject(owner),
      await addSubject(owner),
    ];
    const id = await seedDocument(owner, from);
    const before = await docRow(id);
    await send(owner, subjectMutation("delete", { id: gone }));

    await send(owner, documentMutation("upsert", { id, subjectId: to, title: before.title }));
    expect(await docRow(id)).toEqual({ ...before, subject_id: to });

    for (const subjectId of [gone, newId()]) {
      expect(
        await send(owner, documentMutation("upsert", { id, subjectId, title: before.title })),
      ).toEqual(rejected("PARENT_DELETED"));
    }
    expect((await docRow(id)).subject_id).toBe(to);
  });

  it("[document#AC-6] never creates a document and never accepts fields stated by the server", async () => {
    const [alice, bob] = [newId(), newId()];
    const subject = await addSubject(alice);
    const id = await seedDocument(alice, subject);
    const before = await docRow(id);
    const own = { id, subjectId: subject, title: "x" };

    expect(await send(alice, documentMutation("upsert", { ...own, id: newId() }))).toEqual(
      rejected("NOT_FOUND"),
    );
    expect(await send(bob, documentMutation("upsert", own))).toEqual(rejected("NOT_FOUND"));
    for (const extra of [
      { status: "REJECTED" },
      { pageCount: 1 },
      { storedFileId: newId() },
      { riskFlags: {} },
    ]) {
      expect(await send(alice, documentMutation("upsert", { ...own, ...extra }))).toEqual(
        rejected("DOCUMENT_INVALID"),
      );
    }
    await send(alice, documentMutation("delete", { id }));
    expect(await send(alice, documentMutation("upsert", own))).toEqual(rejected("NOT_FOUND"));

    expect(await docRow(id)).toMatchObject({
      status: before.status,
      page_count: before.page_count,
      stored_file_id: before.stored_file_id,
      title: before.title,
    });
  });

  it("[document#AC-7] deletes a document under its own root and publishes the event once", async () => {
    const owner = newId();
    const subject = await addSubject(owner);
    const id = await seedDocument(owner, subject);
    deletedEvents.length = 0;

    expect((await send(owner, documentMutation("delete", { id }))).status).toBe("applied");
    expect(await send(owner, documentMutation("delete", { id }))).toEqual(rejected("NOT_FOUND"));

    expect((await docRow(id)).deleted_root_id).toBe(id);
    expect(deletedEvents).toEqual([
      { type: "library.documentDeleted", ownerId: owner, documentId: id, rootId: id },
    ]);
    expect(await changesOf(owner)).toContainEqual({
      entity: "document",
      entityId: id,
      op: "delete",
    });
  });

  it("[document#AC-8] lists a deleted document with its title and restores it unless its subject is deleted", async () => {
    const owner = newId();
    const subject = await addSubject(owner);
    const id = await seedDocument(owner, subject, "Segmento TCP");
    await send(owner, documentMutation("delete", { id }));
    await send(owner, subjectMutation("delete", { id: subject }));

    expect((await trash.list(db, owner)).map((i) => [i.entity, i.id, i.label]).sort()).toEqual(
      [
        ["document", id, "Segmento TCP"],
        ["subject", subject, "Redes"],
      ].sort(),
    );
    await expect(trash.restore(db, owner, id)).rejects.toThrow(
      expect.objectContaining({ code: "PARENT_DELETED" }),
    );
    expect((await docRow(id)).deleted_at).not.toBeNull();

    await trash.restore(db, owner, subject);
    await trash.restore(db, owner, id);
    expect((await docRow(id)).deleted_at).toBeNull();
  });

  it("[document#AC-9] reports only a live document of the owner as live", async () => {
    const [owner, other] = [newId(), newId()];
    const subject = await addSubject(owner);
    const live = await seedDocument(owner, subject);
    const gone = await seedDocument(owner, subject);
    await send(owner, documentMutation("delete", { id: gone }));
    const check = (who: string, id: string) =>
      withUser(db, who, (tx) => documentIsLive(tx, who, id));

    expect(await check(owner, live)).toBe(true);
    expect(await check(owner, gone)).toBe(false);
    expect(await check(owner, newId())).toBe(false);
    expect(await check(other, live)).toBe(false);
  });
});
