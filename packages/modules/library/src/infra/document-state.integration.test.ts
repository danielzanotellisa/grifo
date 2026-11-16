import { newId, withUser, type Db } from "@app/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { documentState } from "./document-liveness";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);

afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const seed = async (owner: string, status: string, pageCount: number | null, deleted = false) => {
  const [subjectId, fileId, id] = [newId(), newId(), newId()];
  await admin.query(`insert into library.subjects (id, owner_id, name) values ($1, $2, 'S')`, [
    subjectId,
    owner,
  ]);
  await admin.query(
    `insert into library.stored_files (id, owner_id, sha256, size_bytes, storage_key) values ($1, $2, $3, 10, $4)`,
    [fileId, owner, fileId.replaceAll("-", "").padEnd(64, "0"), `${owner}/${fileId}.pdf`],
  );
  await admin.query(
    `insert into library.documents (id, owner_id, subject_id, stored_file_id, title, status, page_count, deleted_at, deleted_root_id)
     values ($1, $2, $3, $4, 'doc', $5, $6, $7, $8)`,
    [
      id,
      owner,
      subjectId,
      fileId,
      status,
      pageCount,
      deleted ? new Date() : null,
      deleted ? id : null,
    ],
  );
  return id;
};

describe("documentState", () => {
  it("[document#AC-9] gives the status and page count of a live document of the owner", async () => {
    const owner = newId();
    const ready = await seed(owner, "READY", 12);
    const validating = await seed(owner, "VALIDATING", null);

    const state = (id: string) => withUser(db, owner, (tx) => documentState(tx, owner, id));

    expect(await state(ready)).toEqual({ status: "READY", pageCount: 12 });
    expect(await state(validating)).toEqual({ status: "VALIDATING", pageCount: null });
  });

  it("[document#AC-9] gives nothing for a deleted, missing or foreign document", async () => {
    const [owner, other] = [newId(), newId()];
    const live = await seed(owner, "READY", 5);
    const gone = await seed(owner, "READY", 5, true);

    expect(await withUser(db, owner, (tx) => documentState(tx, owner, gone))).toBeNull();
    expect(await withUser(db, owner, (tx) => documentState(tx, owner, newId()))).toBeNull();
    expect(await withUser(db, other, (tx) => documentState(tx, other, live))).toBeNull();
  });
});
