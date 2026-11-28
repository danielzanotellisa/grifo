import { createHash, randomBytes } from "node:crypto";
import { createS3Storage, ensureS3Buckets, newId, s3ConfigFromEnv, type Db } from "@app/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDeepScan, type Scanner } from "./deep-scan";
import { createDocumentValidation } from "./document-validation";
import { createUploads } from "./upload";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);
const config = s3ConfigFromEnv(process.env);
const storage = createS3Storage(config);
const uploads = createUploads({ db, storage });
const validation = createDocumentValidation({
  db,
  storage,
  inspect: async () => ({ ok: true, pageCount: 1, riskFlags: {}, hasText: true }),
});

beforeAll(() => ensureS3Buckets(config));
afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const rows = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const clean: Scanner = async () => ({ clean: true });
const infected: Scanner = async () => ({ clean: false, signature: "Test-Signature" });
const attempt = { lastAttempt: false };

const pdfBytes = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(64)]);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A document that went through upload, confirm and validation, in a fresh subject of `owner`. */
const readyDocument = async (owner: string, bytes: Buffer = pdfBytes()) => {
  const subjectId = newId();
  await admin.query(`insert into library.subjects (id, owner_id, name) values ($1, $2, 'Redes')`, [
    subjectId,
    owner,
  ]);
  const start = await uploads.start(owner, {
    documentId: newId(),
    subjectId,
    title: "Aula",
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
  });
  if (start.upload) {
    await fetch(start.upload.url, {
      method: "PUT",
      body: Buffer.from(bytes),
      headers: start.upload.headers,
    });
  }
  await uploads.confirm(owner, start.documentId);
  await validation.run(owner, start.documentId, attempt);
  return start.documentId;
};
const statusOf = async (id: string) =>
  (await rows(`select status, reject_code from library.documents where id = $1`, [id]))[0] as {
    status: string;
    reject_code: string | null;
  };
const scanJobs = (documentId: string) =>
  rows(
    `select j.payload from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
     where t.identifier = 'document.deepScan' and j.payload->>'documentId' = $1`,
    [documentId],
  );
const changesOf = async (owner: string) =>
  (await rows(`select entity_id from platform.change_log where owner_id = $1`, [owner])).length;
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: { code?: string }) => error.code,
  );

describe("enqueueing the deep scan", () => {
  it("[document/deep-scan#AC-1] enqueues one job with only ids when validation ends READY", async () => {
    const owner = newId();
    const id = await readyDocument(owner);
    await validation.run(owner, id, attempt);

    const jobs = await scanJobs(id);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toEqual({ ownerId: owner, documentId: id });
  });

  it("[document/deep-scan#AC-1] enqueues nothing for a rejected document", async () => {
    const owner = newId();
    const junk = Buffer.from("isto nao e um pdf ".repeat(5));
    const id = await readyDocument(owner, junk);

    expect((await statusOf(id)).status).toBe("REJECTED");
    expect(await scanJobs(id)).toHaveLength(0);
  });
});

describe("running the deep scan", () => {
  it("[document/deep-scan#AC-2] leaves a clean document alone", async () => {
    const owner = newId();
    const id = await readyDocument(owner);
    const before = await changesOf(owner);

    await createDeepScan({ db, storage, scan: clean }).run(owner, id, attempt);

    expect((await statusOf(id)).status).toBe("READY");
    expect(await changesOf(owner)).toBe(before);
  });

  it("[document/deep-scan#AC-3] quarantines every live document of the owner that uses the file", async () => {
    const [owner, other] = [newId(), newId()];
    const bytes = pdfBytes();
    const [first, second] = [await readyDocument(owner, bytes), await readyDocument(owner, bytes)];
    const trashed = await readyDocument(owner, bytes);
    await admin.query(
      `update library.documents set deleted_at = now(), deleted_root_id = id where id = $1`,
      [trashed],
    );
    const unrelated = await readyDocument(owner);
    const foreign = await readyDocument(other, bytes);
    const before = await changesOf(owner);

    await createDeepScan({ db, storage, scan: infected }).run(owner, first, attempt);

    expect(await statusOf(first)).toEqual({
      status: "QUARANTINED",
      reject_code: "MALWARE_DETECTED",
    });
    expect(await statusOf(second)).toEqual({
      status: "QUARANTINED",
      reject_code: "MALWARE_DETECTED",
    });
    expect((await statusOf(trashed)).status).toBe("READY");
    expect((await statusOf(unrelated)).status).toBe("READY");
    expect((await statusOf(foreign)).status).toBe("READY");
    expect(await changesOf(owner)).toBe(before + 2);
    expect(await code(uploads.open(owner, first))).toBe("DOCUMENT_NOT_READY");
  });

  it("[document/deep-scan#AC-4] leaves alone a document that is not READY, and a second run changes nothing", async () => {
    const owner = newId();
    const bytes = pdfBytes();
    const [rejectedLater, deleted, quarantined] = [
      await readyDocument(owner, bytes),
      await readyDocument(owner),
      await readyDocument(owner),
    ];
    await admin.query(`update library.documents set status = 'REJECTED' where id = $1`, [
      rejectedLater,
    ]);
    await admin.query(
      `update library.documents set deleted_at = now(), deleted_root_id = id where id = $1`,
      [deleted],
    );
    const scan = createDeepScan({ db, storage, scan: infected });

    await scan.run(owner, rejectedLater, attempt);
    await scan.run(owner, deleted, attempt);
    await scan.run(owner, quarantined, attempt);
    const afterFirst = await changesOf(owner);
    await scan.run(owner, quarantined, attempt);

    expect((await statusOf(rejectedLater)).status).toBe("REJECTED");
    expect((await statusOf(deleted)).status).toBe("READY");
    expect((await statusOf(quarantined)).status).toBe("QUARANTINED");
    expect(await changesOf(owner)).toBe(afterFirst);
  });

  it("[document/deep-scan#AC-5] retries while the scanner fails and leaves the document READY after the last attempt", async () => {
    const owner = newId();
    const id = await readyDocument(owner);
    const logged: unknown[] = [];
    const down: Scanner = async () => {
      throw new Error("clamd is down");
    };
    const scan = createDeepScan({ db, storage, scan: down, log: (...args) => logged.push(args) });

    await expect(scan.run(owner, id, { lastAttempt: false })).rejects.toThrow("clamd is down");
    expect(logged).toHaveLength(0);
    await scan.run(owner, id, { lastAttempt: true });

    expect((await statusOf(id)).status).toBe("READY");
    expect(logged).toHaveLength(1);
  });
});
