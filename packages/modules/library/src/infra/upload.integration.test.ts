import { createHash, randomBytes } from "node:crypto";
import {
  createS3Storage,
  ensureS3Buckets,
  newId,
  originalKey,
  s3ConfigFromEnv,
  type Db,
} from "@app/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocumentValidation, type PdfInspector } from "./document-validation";
import { createUploads } from "./upload";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);
const config = s3ConfigFromEnv(process.env);
const storage = createS3Storage(config);
const uploads = createUploads({ db, storage });

beforeAll(() => ensureS3Buckets(config));
afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const rows = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const code = async (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: { code?: string; status?: number }) => `${error.status}:${error.code}`,
  );

const newOwner = () => newId();
const newSubject = async (owner: string, deleted = false) => {
  const id = newId();
  await admin.query(
    `insert into library.subjects (id, owner_id, name, deleted_at, deleted_root_id)
     values ($1, $2, 'Redes', ${deleted ? "now()" : "null"}, ${deleted ? "$1" : "null"})`,
    [id, owner],
  );
  return id;
};
const pdfBytes = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(64)]);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const input = (subjectId: string, bytes: Uint8Array, documentId = newId()) => ({
  documentId,
  subjectId,
  title: "Aula 1",
  sha256: sha256(bytes),
  sizeBytes: bytes.length,
});
const putTo = async (upload: { url: string; headers: Record<string, string> }, body: Uint8Array) =>
  fetch(upload.url, { method: "PUT", body: Buffer.from(body), headers: upload.headers });
const documentRow = async (id: string) =>
  (
    await rows(
      `select status, reject_code, page_count, risk_flags from library.documents where id = $1`,
      [id],
    )
  )[0];
const jobsFor = (documentId: string) =>
  rows(
    `select j.payload from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
     where t.identifier = 'document.validate' and j.payload->>'documentId' = $1`,
    [documentId],
  );

describe("starting an upload", () => {
  it("[document/upload#AC-2] reuses the bytes of the owner and keeps two owners apart", async () => {
    const [a, b] = [newOwner(), newOwner()];
    const [subjectA, subjectB] = [await newSubject(a), await newSubject(b)];
    const bytes = pdfBytes();

    const first = await uploads.start(a, input(subjectA, bytes));
    expect((await putTo(first.upload!, bytes)).status).toBe(200);
    const again = await uploads.start(a, input(subjectA, bytes));
    const other = await uploads.start(b, input(subjectB, bytes));
    expect((await putTo(other.upload!, bytes)).status).toBe(200);

    expect(again.upload).toBeNull();
    expect(await rows(`select 1 from library.stored_files where owner_id = $1`, [a])).toHaveLength(
      1,
    );
    expect(await rows(`select 1 from library.documents where owner_id = $1`, [a])).toHaveLength(2);
    expect(await storage.head("originals", originalKey(a, sha256(bytes)))).not.toBeNull();
    expect(await storage.head("originals", originalKey(b, sha256(bytes)))).not.toBeNull();
    expect((await documentRow(again.documentId))!.status).toBe("UPLOADED");
  });

  it("[document/upload#AC-4] refuses what cannot become a document and creates nothing", async () => {
    const [owner, intruder] = [newOwner(), newOwner()];
    const subject = await newSubject(owner);
    const bytes = pdfBytes();
    const taken = input(subject, bytes);
    await uploads.start(owner, taken);

    const results = {
      tooLarge: await code(
        uploads.start(owner, { ...input(subject, bytes), sizeBytes: 100 * 1024 * 1024 + 1 }),
      ),
      malformed: await code(uploads.start(owner, { ...input(subject, bytes), sha256: "XYZ" })),
      noTitle: await code(uploads.start(owner, { ...input(subject, bytes), title: "  " })),
      missingSubject: await code(uploads.start(owner, input(newId(), bytes))),
      foreignSubject: await code(uploads.start(intruder, input(subject, bytes))),
      deletedSubject: await code(uploads.start(owner, input(await newSubject(owner, true), bytes))),
      foreignDocument: await code(
        uploads.start(intruder, {
          ...input(await newSubject(intruder), bytes),
          documentId: taken.documentId,
        }),
      ),
    };

    expect(results).toEqual({
      tooLarge: "413:UPLOAD_TOO_LARGE",
      malformed: "400:VALIDATION_FAILED",
      noTitle: "400:VALIDATION_FAILED",
      missingSubject: "404:NOT_FOUND",
      foreignSubject: "404:NOT_FOUND",
      deletedSubject: "422:PARENT_DELETED",
      foreignDocument: "404:NOT_FOUND",
    });
    expect(await rows(`select 1 from library.documents where owner_id = $1`, [owner])).toHaveLength(
      1,
    );
    expect(
      await rows(`select 1 from library.documents where owner_id = $1`, [intruder]),
    ).toHaveLength(0);
  });

  it("[document/upload#AC-5] is idempotent per document id and refuses a conflicting repeat", async () => {
    const owner = newOwner();
    const subject = await newSubject(owner);
    const bytes = pdfBytes();
    const first = input(subject, bytes);

    const one = await uploads.start(owner, first);
    const two = await uploads.start(owner, first);
    const conflict = await code(uploads.start(owner, { ...first, sha256: sha256(pdfBytes()) }));
    const otherSubject = await code(
      uploads.start(owner, { ...first, subjectId: await newSubject(owner) }),
    );

    const otherSize = await code(
      uploads.start(owner, { ...input(subject, bytes), sizeBytes: bytes.length + 1 }),
    );

    expect(otherSize).toBe("409:UPLOAD_CONFLICT");
    expect(two.documentId).toBe(one.documentId);
    expect(two.upload!.url).toBeTruthy();
    expect(await rows(`select 1 from library.documents where owner_id = $1`, [owner])).toHaveLength(
      1,
    );
    expect(conflict).toBe("409:UPLOAD_CONFLICT");
    expect(otherSubject).toBe("409:UPLOAD_CONFLICT");
  });

  it("[document/upload#AC-11] records the document in the change log from the start", async () => {
    const owner = newOwner();
    const subject = await newSubject(owner);
    const start = await uploads.start(owner, input(subject, pdfBytes()));

    const log = await rows(
      `select entity, entity_id, op from platform.change_log where owner_id = $1`,
      [owner],
    );

    expect(log).toEqual([{ entity: "document", entity_id: start.documentId, op: "upsert" }]);
  });
});

describe("confirming an upload", () => {
  it("[document/upload#AC-7] needs the object, then validates once", async () => {
    const owner = newOwner();
    const subject = await newSubject(owner);
    const bytes = pdfBytes();
    const start = await uploads.start(owner, input(subject, bytes));

    const early = await code(uploads.confirm(owner, start.documentId));
    expect((await documentRow(start.documentId))!.status).toBe("UPLOADED");
    await putTo(start.upload!, bytes);
    const confirmed = await uploads.confirm(owner, start.documentId);
    const repeated = await uploads.confirm(owner, start.documentId);

    expect(early).toBe("409:UPLOAD_INCOMPLETE");
    expect(confirmed).toEqual({ status: "VALIDATING" });
    expect(repeated).toEqual({ status: "VALIDATING" });
    expect((await documentRow(start.documentId))!.status).toBe("VALIDATING");
    const jobs = await jobsFor(start.documentId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toEqual({ ownerId: owner, documentId: start.documentId });
  });

  it("[document/upload#AC-7] refuses an object of another size", async () => {
    const owner = newOwner();
    const subject = await newSubject(owner);
    const bytes = pdfBytes();
    const start = await uploads.start(owner, {
      ...input(subject, bytes),
      sizeBytes: bytes.length + 5,
    });
    await putTo(start.upload!, bytes);

    expect(await code(uploads.confirm(owner, start.documentId))).toBe("409:UPLOAD_INCOMPLETE");
    expect((await documentRow(start.documentId))!.status).toBe("UPLOADED");
  });

  it("answers 404 for a document of another user", async () => {
    const [owner, intruder] = [newOwner(), newOwner()];
    const start = await uploads.start(owner, input(await newSubject(owner), pdfBytes()));

    expect(await code(uploads.confirm(intruder, start.documentId))).toBe("404:NOT_FOUND");
    expect(await code(uploads.open(intruder, start.documentId))).toBe("404:NOT_FOUND");
  });
});

describe("opening a document", () => {
  it("[document/upload#AC-9] serves the original of a READY document only", async () => {
    const owner = newOwner();
    const subject = await newSubject(owner);
    const bytes = pdfBytes();
    const start = await uploads.start(owner, input(subject, bytes));
    await putTo(start.upload!, bytes);

    const notReady = await code(uploads.open(owner, start.documentId));
    await admin.query(`update library.documents set status = 'READY' where id = $1`, [
      start.documentId,
    ]);
    const opened = await uploads.open(owner, start.documentId);
    const served = await fetch(opened.url);
    await admin.query(
      `update library.documents set deleted_at = now(), deleted_root_id = id where id = $1`,
      [start.documentId],
    );

    expect(notReady).toBe("409:DOCUMENT_NOT_READY");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(bytes);
    expect(opened.expiresInSeconds).toBe(300);
    expect(await code(uploads.open(owner, start.documentId))).toBe("404:NOT_FOUND");
    expect(await code(uploads.open(owner, newId()))).toBe("404:NOT_FOUND");
  });
});

describe("validating a document", () => {
  const validating = async () => {
    const owner = newOwner();
    const subject = await newSubject(owner);
    const bytes = pdfBytes();
    const start = await uploads.start(owner, input(subject, bytes));
    await putTo(start.upload!, bytes);
    await uploads.confirm(owner, start.documentId);
    return { owner, documentId: start.documentId };
  };

  it("[document/upload#AC-8] ends READY with the page count, and a repeat changes nothing", async () => {
    const { owner, documentId } = await validating();
    let calls = 0;
    const inspect: PdfInspector = async () => {
      calls++;
      return {
        ok: true,
        pageCount: calls === 1 ? 7 : 99,
        riskFlags: { javascript: 1 },
        hasText: true,
      };
    };
    const validation = createDocumentValidation({ db, storage, inspect });

    await validation.run(owner, documentId, { lastAttempt: false });
    await validation.run(owner, documentId, { lastAttempt: false });

    expect(await documentRow(documentId)).toMatchObject({
      status: "READY",
      page_count: 7,
      risk_flags: { javascript: 1 },
      reject_code: null,
    });
    expect(calls).toBe(1);
  });

  it("[document/upload#AC-1] rejects what has no PDF signature without asking the parser", async () => {
    const owner = newOwner();
    const subject = await newSubject(owner);
    const junk = Buffer.from("isto nao e um pdf, so tem a extensao".repeat(4));
    const start = await uploads.start(owner, input(subject, junk));
    await putTo(start.upload!, junk);
    await uploads.confirm(owner, start.documentId);
    const inspect: PdfInspector = async () => {
      throw new Error("the parser must not run");
    };

    await createDocumentValidation({ db, storage, inspect }).run(owner, start.documentId, {
      lastAttempt: false,
    });

    expect(await documentRow(start.documentId)).toMatchObject({
      status: "REJECTED",
      reject_code: "PDF_INVALID",
    });
  });

  it("[document/upload#AC-8] records the parser's verdict as the reject code", async () => {
    const { owner, documentId } = await validating();
    const inspect: PdfInspector = async () => ({ ok: false, code: "PDF_ENCRYPTED" });

    await createDocumentValidation({ db, storage, inspect }).run(owner, documentId, {
      lastAttempt: false,
    });

    expect(await documentRow(documentId)).toMatchObject({
      status: "REJECTED",
      reject_code: "PDF_ENCRYPTED",
    });
  });

  it("[document/upload#AC-12] throws to be retried, and rejects only on the last attempt", async () => {
    const { owner, documentId } = await validating();
    const inspect: PdfInspector = async () => {
      throw new Error("boom");
    };
    const validation = createDocumentValidation({ db, storage, inspect });

    await expect(validation.run(owner, documentId, { lastAttempt: false })).rejects.toThrow("boom");
    expect((await documentRow(documentId))!.status).toBe("VALIDATING");
    await validation.run(owner, documentId, { lastAttempt: true });

    expect(await documentRow(documentId)).toMatchObject({
      status: "REJECTED",
      reject_code: "VALIDATION_FAILED",
    });
  });

  it("[document/upload#AC-11] records each status change in the change log", async () => {
    const { owner, documentId } = await validating();
    const inspect: PdfInspector = async () => ({
      ok: true,
      pageCount: 1,
      riskFlags: {},
      hasText: true,
    });

    await createDocumentValidation({ db, storage, inspect }).run(owner, documentId, {
      lastAttempt: false,
    });

    const log = await rows(
      `select entity_id, op from platform.change_log where owner_id = $1 order by seq`,
      [owner],
    );
    expect(log).toEqual([
      { entity_id: documentId, op: "upsert" },
      { entity_id: documentId, op: "upsert" },
      { entity_id: documentId, op: "upsert" },
    ]);
  });
});
