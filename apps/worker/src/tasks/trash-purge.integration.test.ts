import { annotationPurgeParticipant } from "@app/annotation";
import { createExportPurgeParticipant } from "@app/export";
import { createLibraryPurgeParticipant } from "@app/library";
import { outlinePurgeParticipant } from "@app/outline";
import {
  createDb,
  createPurge,
  createS3Storage,
  createSyncEngine,
  createTrash,
  ensureS3Buckets,
  newId,
  s3ConfigFromEnv,
  type ObjectStorage,
} from "@app/platform";
import { studyPurgeParticipant } from "@app/study";
import {
  createDocumentSyncHandler,
  createSubjectSyncHandler,
  documentTrashParticipant,
  subjectTrashParticipant,
} from "@app/library";
import { createInProcessEventBus } from "@app/platform";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crontab, createTaskList } from "../schedule";
import { createPurgeTask } from "./trash-purge";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const adminDb = createDb(process.env.DATABASE_MIGRATOR_URL ?? "");
const config = s3ConfigFromEnv(process.env);
const storage = createS3Storage(config);

/** A storage that can be told to fail, to test that one broken step does not stop the others. */
let storageDown = false;
const flakyStorage: ObjectStorage = {
  ...storage,
  delete: async (bucket, key) => {
    if (storageDown) throw new Error("storage is down");
    return storage.delete(bucket, key);
  },
};
const purge = createPurge([
  createLibraryPurgeParticipant({ storage: flakyStorage }),
  annotationPurgeParticipant,
  outlinePurgeParticipant,
  studyPurgeParticipant,
  createExportPurgeParticipant({ storage: flakyStorage }),
]);

beforeAll(() => ensureS3Buckets(config));
afterAll(() => admin.end());

const run = () => purge.run(adminDb);
const rows = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const exists = async (table: string, id: string) =>
  (await rows(`select 1 from ${table} where id = $1`, [id])).length === 1;

/** `old` rows were deleted 31 days ago, `recent` ones 29 days ago, `live` ones never. */
type Age = "old" | "recent" | "live";
const deletion = (age: Age, id: string): string =>
  age === "live" ? "null, null" : `now() - interval '${age === "old" ? 31 : 29} days', '${id}'`;
const SHA = () => newId().replaceAll("-", "").padEnd(64, "0");

const subject = async (owner: string, age: Age = "live", rootId?: string) => {
  const id = newId();
  await admin.query(
    `insert into library.subjects (id, owner_id, name, deleted_at, deleted_root_id) values ($1, $2, 'Redes', ${deletion(age, rootId ?? id)})`,
    [id, owner],
  );
  return id;
};
const storedFile = async (owner: string, opts: { createdDaysAgo?: number; sha?: string } = {}) => {
  const id = newId();
  const sha = opts.sha ?? SHA();
  const key = `${owner}/${sha}.pdf`;
  await admin.query(
    `insert into library.stored_files (id, owner_id, sha256, size_bytes, storage_key, created_at)
     values ($1, $2, $3, 4, $4, now() - ($5 || ' days')::interval)`,
    [id, owner, sha, key, String(opts.createdDaysAgo ?? 60)],
  );
  await storage.put("originals", key, Buffer.from("%PDF"), "application/pdf");
  return { id, key };
};
const document = async (
  owner: string,
  subjectId: string,
  fileId: string,
  age: Age = "live",
  rootId?: string,
) => {
  const id = newId();
  await admin.query(
    `insert into library.documents (id, owner_id, subject_id, stored_file_id, title, status, page_count, deleted_at, deleted_root_id)
     values ($1, $2, $3, $4, 'Aula', 'READY', 1, ${deletion(age, rootId ?? id)})`,
    [id, owner, subjectId, fileId],
  );
  return id;
};
const category = async (owner: string, age: Age = "live") => {
  const id = newId();
  await admin.query(
    `insert into annotation.categories (id, owner_id, name, color, role, position, deleted_at, deleted_root_id)
     values ($1, $2, 'Definição', '#ff0000', 'DEFINITION', 'a0', ${deletion(age, id)})`,
    [id, owner],
  );
  return id;
};
const highlight = async (
  owner: string,
  documentId: string,
  categoryId: string,
  age: Age = "live",
  rootId?: string,
) => {
  const id = newId();
  await admin.query(
    `insert into annotation.highlights (id, owner_id, document_id, category_id, page_index, rects, quote, deleted_at, deleted_root_id)
     values ($1, $2, $3, $4, 0, '[]', '{}', ${deletion(age, rootId ?? id)})`,
    [id, owner, documentId, categoryId],
  );
  return id;
};
const node = async (owner: string, documentId: string, age: Age = "live", rootId?: string) => {
  const id = newId();
  await admin.query(
    `insert into outline.nodes (id, owner_id, document_id, position, role, text, deleted_at, deleted_root_id)
     values ($1, $2, $3, 'a0', 'TOPIC', 'Tópico', ${deletion(age, rootId ?? id)})`,
    [id, owner, documentId],
  );
  return id;
};
const flashcard = async (owner: string, documentId: string, age: Age = "live", rootId?: string) => {
  const id = newId();
  await admin.query(
    `insert into study.flashcards (id, owner_id, document_id, front, back, deleted_at, deleted_root_id)
     values ($1, $2, $3, 'frente', 'verso', ${deletion(age, rootId ?? id)})`,
    [id, owner, documentId],
  );
  return id;
};
const exportRow = async (owner: string, age: Age, resultKey?: string) => {
  const id = newId();
  await admin.query(
    `insert into export.exports (id, owner_id, kind, scope, snapshot_cursor, result_key, deleted_at, deleted_root_id)
     values ($1, $2, 'SUMMARY_PDF', 'DOCUMENT', 0, $3, ${deletion(age, id)})`,
    [id, owner, resultKey ?? null],
  );
  if (resultKey) await storage.put("derived", resultKey, Buffer.from("%PDF"), "application/pdf");
  return id;
};

/** One of each kind of row, of one owner, in the given state. */
const world = async (owner: string, age: Age) => {
  const s = await subject(owner, age);
  const file = await storedFile(owner);
  const d = await document(owner, s, file.id, age);
  const c = await category(owner, age);
  return {
    subject: s,
    document: d,
    category: c,
    highlight: await highlight(owner, d, c, age),
    node: await node(owner, d, age),
    flashcard: await flashcard(owner, d, age),
    export: await exportRow(owner, age, `${owner}/${newId()}.pdf`),
    file,
  };
};
const TABLES = {
  subject: "library.subjects",
  document: "library.documents",
  category: "annotation.categories",
  highlight: "annotation.highlights",
  node: "outline.nodes",
  flashcard: "study.flashcards",
  export: "export.exports",
} as const;
const present = async (w: Awaited<ReturnType<typeof world>>) =>
  Object.fromEntries(
    await Promise.all(
      (Object.keys(TABLES) as (keyof typeof TABLES)[]).map(
        async (key) => [key, await exists(TABLES[key], w[key])] as const,
      ),
    ),
  );
const ALL = (value: boolean) => Object.fromEntries(Object.keys(TABLES).map((key) => [key, value]));

describe("trash.purge", () => {
  it("[_cross-cutting/purge#AC-1] deletes the rows past the window of every owner and keeps the rest", async () => {
    const [a, b] = [newId(), newId()];
    const [oldA, oldB, recent, live] = [
      await world(a, "old"),
      await world(b, "old"),
      await world(a, "recent"),
      await world(b, "live"),
    ];

    await run();

    expect(await present(oldA)).toEqual(ALL(false));
    expect(await present(oldB)).toEqual(ALL(false));
    expect(await present(recent)).toEqual(ALL(true));
    expect(await present(live)).toEqual(ALL(true));
  });

  it("[_cross-cutting/purge#AC-2] deletes a cascaded subtree together and a child trashed earlier on its own", async () => {
    const owner = newId();
    const root = await subject(owner, "old");
    const file = await storedFile(owner);
    const cat = await category(owner);
    const cascaded = await document(owner, root, file.id, "old", root);
    const alone = await document(owner, root, file.id, "old");
    const ids = {
      highlight: await highlight(owner, cascaded, cat, "old", root),
      node: await node(owner, cascaded, "old", root),
      flashcard: await flashcard(owner, cascaded, "old", root),
    };

    await run();

    expect(await exists("library.subjects", root)).toBe(false);
    expect(await exists("library.documents", cascaded)).toBe(false);
    expect(await exists("library.documents", alone)).toBe(false);
    expect(await exists("annotation.highlights", ids.highlight)).toBe(false);
    expect(await exists("outline.nodes", ids.node)).toBe(false);
    expect(await exists("study.flashcards", ids.flashcard)).toBe(false);
    expect(await exists("annotation.categories", cat)).toBe(true);
  });

  it("[_cross-cutting/purge#AC-3] keeps a parent that is still referenced and removes it on a later run", async () => {
    const owner = newId();
    const file = await storedFile(owner);
    const oldCategory = await category(owner, "old");
    const oldSubject = await subject(owner, "old");
    const holder = await document(owner, oldSubject, file.id, "recent", undefined);
    await admin.query(`update library.documents set subject_id = $1 where id = $2`, [
      oldSubject,
      holder,
    ]);
    const cardHolder = await highlight(owner, holder, oldCategory, "recent");

    await run();

    expect(await exists("annotation.categories", oldCategory)).toBe(true);
    expect(await exists("library.subjects", oldSubject)).toBe(true);

    await admin.query(
      `update library.documents set deleted_at = now() - interval '31 days' where id = $1`,
      [holder],
    );
    await admin.query(
      `update annotation.highlights set deleted_at = now() - interval '31 days' where id = $1`,
      [cardHolder],
    );
    await run();

    expect(await exists("annotation.categories", oldCategory)).toBe(false);
    expect(await exists("library.subjects", oldSubject)).toBe(false);
  });

  it("[_cross-cutting/purge#AC-4] deletes a stored file with its last document, and only then", async () => {
    const [owner, other] = [newId(), newId()];
    const sha = SHA();
    const shared = await storedFile(owner, { sha });
    const foreign = await storedFile(other, { sha });
    const s = await subject(owner);
    await document(owner, s, shared.id, "old");
    const stillThere = await document(owner, s, shared.id, "recent");
    await document(other, await subject(other), foreign.id, "old");

    await run();

    expect(await exists("library.stored_files", shared.id)).toBe(true);
    expect(await storage.head("originals", shared.key)).not.toBeNull();
    expect(await exists("library.stored_files", foreign.id)).toBe(false);
    expect(await storage.head("originals", foreign.key)).toBeNull();

    await admin.query(
      `update library.documents set deleted_at = now() - interval '31 days' where id = $1`,
      [stillThere],
    );
    await run();

    expect(await exists("library.stored_files", shared.id)).toBe(false);
    expect(await storage.head("originals", shared.key)).toBeNull();
  });

  it("[_cross-cutting/purge#AC-5] removes an old orphan stored file and keeps a recent one", async () => {
    const owner = newId();
    const old = await storedFile(owner, { createdDaysAgo: 31 });
    const recent = await storedFile(owner, { createdDaysAgo: 1 });

    await run();

    expect(await exists("library.stored_files", old.id)).toBe(false);
    expect(await storage.head("originals", old.key)).toBeNull();
    expect(await exists("library.stored_files", recent.id)).toBe(true);
    expect(await storage.head("originals", recent.key)).not.toBeNull();
  });

  it("[_cross-cutting/purge#AC-6] changes nothing on a second run, even with the object already gone", async () => {
    const owner = newId();
    const w = await world(owner, "old");
    const orphan = await storedFile(owner, { createdDaysAgo: 40 });
    await storage.delete("originals", orphan.key);

    await run();
    await run();

    expect(await present(w)).toEqual(ALL(false));
    expect(await exists("library.stored_files", orphan.id)).toBe(false);
  });

  it("[_cross-cutting/purge#AC-7] purges the other modules when the storage fails, fails, and completes later", async () => {
    const owner = newId();
    const w = await world(owner, "old");
    const orphan = await storedFile(owner, { createdDaysAgo: 40 });

    storageDown = true;
    try {
      await expect(run()).rejects.toThrow("The purge failed in: library, export");
    } finally {
      storageDown = false;
    }

    expect(await exists("annotation.highlights", w.highlight)).toBe(false);
    expect(await exists("outline.nodes", w.node)).toBe(false);
    expect(await exists("study.flashcards", w.flashcard)).toBe(false);
    expect(await exists("library.stored_files", orphan.id)).toBe(true);
    expect(await storage.head("originals", orphan.key)).not.toBeNull();

    await run();

    expect(await exists("library.stored_files", orphan.id)).toBe(false);
    expect(await storage.head("originals", orphan.key)).toBeNull();
    expect(await present(w)).toEqual(ALL(false));
  });

  it("[_cross-cutting/purge#AC-8] leaves a purged document out of the trash, unrestorable and a tombstone in a pull", async () => {
    const owner = newId();
    const events = createInProcessEventBus();
    const engine = createSyncEngine([
      createSubjectSyncHandler({ events }),
      createDocumentSyncHandler({ events }),
    ]);
    const trash = createTrash([subjectTrashParticipant, documentTrashParticipant]);
    const s = await subject(owner);
    const file = await storedFile(owner);
    const d = await document(owner, s, file.id);
    await admin.query(
      `insert into platform.change_log (owner_id, entity, entity_id, op) values ($1, 'document', $2, 'upsert')`,
      [owner, d],
    );
    await admin.query(
      `update library.documents set deleted_at = now() - interval '31 days', deleted_root_id = id where id = $1`,
      [d],
    );

    await run();

    const appDb = createDb(process.env.DATABASE_URL ?? "");
    const pulled = await engine.pull(appDb, owner, 0);
    expect(pulled.changes).toEqual([{ entity: "document", entityId: d, op: "delete" }]);
    expect(await trash.list(appDb, owner)).toEqual([]);
    await expect(trash.restore(appDb, owner, d)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("[_cross-cutting/purge#AC-9] deletes an expired export with its result object and keeps a recent one", async () => {
    const owner = newId();
    const oldKey = `${owner}/old.pdf`;
    const recentKey = `${owner}/recent.pdf`;
    const old = await exportRow(owner, "old", oldKey);
    const recent = await exportRow(owner, "recent", recentKey);

    await run();

    expect(await exists("export.exports", old)).toBe(false);
    expect(await storage.head("derived", oldKey)).toBeNull();
    expect(await exists("export.exports", recent)).toBe(true);
    expect(await storage.head("derived", recentKey)).not.toBeNull();
  });
});

describe("the purge task in the worker", () => {
  it("[_cross-cutting/purge#AC-10] runs the purge, is in the task list and is scheduled daily", async () => {
    const calls: string[] = [];
    const task = createPurgeTask({
      db: adminDb,
      purge: { run: async () => void calls.push("run") },
    });
    const noop = async () => undefined;
    const list = createTaskList({
      validateDocument: noop,
      deepScan: noop,
      purge: task,
      sendEmail: noop,
      expireMail: noop,
    });

    await (list["trash.purge"] as (...args: unknown[]) => Promise<void>)({}, {});

    expect(calls).toEqual(["run"]);
    expect(crontab.split("\n")).toContain("0 4 * * * trash.purge");
  });
});
