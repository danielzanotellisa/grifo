import {
  createDb,
  createSyncEngine,
  createTrash,
  ensureS3Buckets,
  newId,
  type ObjectStorage,
} from "@app/platform";
import {
  createDocumentSyncHandler,
  createSubjectSyncHandler,
  documentTrashParticipant,
  subjectTrashParticipant,
} from "@app/library";
import { createInProcessEventBus } from "@app/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPurge } from "../purge-setup";
import { createTaskList, cronItems } from "../schedule";
import {
  admin,
  adminDb,
  ALL,
  category,
  config,
  document,
  exists,
  exportRow,
  flashcard,
  highlight,
  node,
  present,
  rows,
  SHA,
  storage,
  storedFile,
  subject,
  world,
} from "./purge-fixtures";
import { createPurgeTask } from "./trash-purge";

/** A storage that can be told to fail, to test that one broken step does not stop the others. */
let storageDown = false;
const flakyStorage: ObjectStorage = {
  ...storage,
  delete: async (bucket, key) => {
    if (storageDown) throw new Error("storage is down");
    return storage.delete(bucket, key);
  },
};
const purge = buildPurge(flakyStorage);

beforeAll(() => ensureS3Buckets(config));
afterAll(() => admin.end());

const run = () => purge.run(adminDb);

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
      exportRender: noop,
      purge: task,
      sendEmail: noop,
      expireMail: noop,
    });

    await (list["trash.purge"] as (...args: unknown[]) => Promise<void>)({}, {});

    expect(calls).toEqual(["run"]);
    expect(cronItems).toContainEqual(
      expect.objectContaining({ task: "trash.purge", match: "0 4 * * *" }),
    );
  });
});

// The account tests share the file (and so the run order) with the trash tests: both run the whole purge on the same database.
type Account = { id: string; email: string };
/** An account with a user row, a session, a credential, a verification, a pending mail and a rate-limit counter. */
const account = async (deletedDaysAgo: number | null): Promise<Account> => {
  const id = newId();
  const email = `purge-${id}@example.com`;
  await admin.query(
    `insert into identity.users (id, email, deleted_at) values ($1, $2, ${
      deletedDaysAgo === null ? "null" : `now() - interval '${deletedDaysAgo} days'`
    })`,
    [id, email],
  );
  await admin.query(
    `insert into identity.sessions (id, user_id, token, expires_at) values ($1, $2, $3, now() + interval '1 day')`,
    [newId(), id, `token-${id}`],
  );
  await admin.query(
    `insert into identity.accounts (id, user_id, account_id, provider_id) values ($1, $2, $3, 'credential')`,
    [newId(), id, id],
  );
  await admin.query(
    `insert into identity.verifications (id, identifier, value, expires_at) values ($1, $2, 'v', now() + interval '1 day')`,
    [newId(), email],
  );
  await admin.query(
    `insert into identity.outgoing_mail (id, to_email, kind, url) values ($1, $2, 'verification', 'http://x')`,
    [newId(), email],
  );
  await admin.query(
    `insert into identity.rate_limits (key, count, last_request) values ($1, 1, 0)`,
    [`account-delete:${id}`],
  );
  await admin.query(
    `insert into platform.change_log (owner_id, entity, entity_id, op) values ($1, 'subject', $2, 'upsert')`,
    [id, newId()],
  );
  await admin.query(
    `insert into platform.processed_mutations (mutation_id, owner_id, outcome) values ($1, $2, '{}')`,
    [newId(), id],
  );
  return { id, email };
};
const identityRows = async (a: Account) =>
  Number(
    (
      await rows(
        `select (select count(*) from identity.users where id = $1)
              + (select count(*) from identity.sessions where user_id = $1)
              + (select count(*) from identity.accounts where user_id = $1)
              + (select count(*) from identity.verifications where identifier = $2)
              + (select count(*) from identity.outgoing_mail where to_email = $2)
              + (select count(*) from identity.rate_limits where key = $3) as n`,
        [a.id, a.email, `account-delete:${a.id}`],
      )
    )[0].n,
  );
const platformRows = async (a: Account) =>
  Number(
    (
      await rows(
        `select (select count(*) from platform.change_log where owner_id = $1)
              + (select count(*) from platform.processed_mutations where owner_id = $1) as n`,
        [a.id],
      )
    )[0].n,
  );
const objectExists = async (bucket: "originals" | "derived", key: string) =>
  (await storage.head(bucket, key)) !== null;

describe("purge of deleted accounts", () => {
  it("[user/purge#AC-1] [user/purge#AC-3] deletes everything of an account deleted 31 days ago and keeps the others", async () => {
    const [old, recent, live] = [await account(31), await account(29), await account(null)];
    const [oldWorld, recentWorld, liveWorld] = [
      await world(old.id, "live"),
      await world(recent.id, "live"),
      await world(live.id, "live"),
    ];

    await run();

    expect(await present(oldWorld)).toEqual(ALL(false));
    expect(await identityRows(old)).toBe(0);
    expect(await platformRows(old)).toBe(0);
    expect(await present(recentWorld)).toEqual(ALL(true));
    expect(await present(liveWorld)).toEqual(ALL(true));
    expect(await identityRows(recent)).toBe(6);
    expect(await identityRows(live)).toBe(6);
    expect(await platformRows(recent)).toBe(2);
    expect(await platformRows(live)).toBe(2);
    expect(await exists("identity.users", old.id)).toBe(false);
  });

  it("[user/purge#AC-2] deletes the objects of the account and leaves another owner's object with the same bytes", async () => {
    const old = await account(31);
    const other = await account(null);
    const sha = "ab".repeat(32);
    const own = await storedFile(old.id, { sha });
    const foreign = await storedFile(other.id, { sha });
    await document(other.id, await subject(other.id), foreign.id);
    const resultKey = `${old.id}/exports/${newId()}.pdf`;
    const exportId = await exportRow(old.id, "live", resultKey);

    await run();

    expect(await objectExists("originals", own.key)).toBe(false);
    expect(await exists("library.stored_files", own.id)).toBe(false);
    expect(await objectExists("derived", resultKey)).toBe(false);
    expect(await exists("export.exports", exportId)).toBe(false);
    expect(await objectExists("originals", foreign.key)).toBe(true);
    expect(await exists("library.stored_files", foreign.id)).toBe(true);
  });

  it("[user/purge#AC-4] purges the other modules, keeps the user and fails when the storage is down, then completes", async () => {
    const old = await account(31);
    const oldWorld = await world(old.id, "live");

    storageDown = true;
    await expect(run()).rejects.toThrow(/purge failed/);
    storageDown = false;

    expect(await exists("annotation.highlights", oldWorld.highlight)).toBe(false);
    expect(await exists("outline.nodes", oldWorld.node)).toBe(false);
    expect(await exists("study.flashcards", oldWorld.flashcard)).toBe(false);
    expect(await exists("library.stored_files", oldWorld.file.id)).toBe(true);
    expect(await exists("export.exports", oldWorld.export)).toBe(true);
    expect(await exists("identity.users", old.id)).toBe(true);

    await run();

    expect(await present(oldWorld)).toEqual(ALL(false));
    expect(await exists("library.stored_files", oldWorld.file.id)).toBe(false);
    expect(await objectExists("originals", oldWorld.file.key)).toBe(false);
    expect(await exists("identity.users", old.id)).toBe(false);
  });

  it("[user/purge#AC-5] changes nothing and does not fail when it runs again", async () => {
    const old = await account(31);
    const live = await account(null);
    const liveWorld = await world(live.id, "live");
    await world(old.id, "live");

    await run();
    await run();

    expect(await present(liveWorld)).toEqual(ALL(true));
    expect(await identityRows(live)).toBe(6);
    expect(await identityRows(old)).toBe(0);
  });

  it("[user/purge#AC-6] runs through the trash.purge task as the worker builds it", async () => {
    const old = await account(31);
    const oldWorld = await world(old.id, "live");

    await createPurgeTask({ db: adminDb, purge: buildPurge(storage) })();

    expect(await present(oldWorld)).toEqual(ALL(false));
    expect(await exists("identity.users", old.id)).toBe(false);
  });
});
