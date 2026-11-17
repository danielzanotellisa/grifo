import { createHash } from "node:crypto";
import { createDocumentSyncHandler, createDocumentValidation, createUploads } from "@app/library";
import {
  createInProcessEventBus,
  createS3Storage,
  createSyncEngine,
  ensureS3Buckets,
  newId,
  s3ConfigFromEnv,
  type Db,
} from "@app/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createValidateDocumentTask } from "./document-validate";
import { encryptedPdf, javascriptPdf, openActionPdf, plainPdf, truncatedPdf } from "./pdf-fixtures";
import { inspectPdf } from "./pdf-inspect";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);
const config = s3ConfigFromEnv(process.env);
const storage = createS3Storage(config);
const uploads = createUploads({ db, storage });
const validation = createDocumentValidation({ db, storage, inspect: inspectPdf });
const task = createValidateDocumentTask({ validation });
const engine = createSyncEngine([createDocumentSyncHandler({ events: createInProcessEventBus() })]);

beforeAll(() => ensureS3Buckets(config));
afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const attempt = (attempts = 1) => ({ job: { attempts, max_attempts: 4 } }) as never;
const uploaded = async (bytes: Buffer) => {
  const owner = newId();
  const subjectId = newId();
  await admin.query(`insert into library.subjects (id, owner_id, name) values ($1, $2, 'Redes')`, [
    subjectId,
    owner,
  ]);
  const start = await uploads.start(owner, {
    documentId: newId(),
    subjectId,
    title: "Aula",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
  });
  const put = await fetch(start.upload!.url, {
    method: "PUT",
    body: new Uint8Array(bytes),
    headers: start.upload!.headers,
  });
  expect(put.status).toBe(200);
  await uploads.confirm(owner, start.documentId);
  return { owner, documentId: start.documentId };
};
const validated = async (bytes: Buffer) => {
  const { owner, documentId } = await uploaded(bytes);
  await task({ ownerId: owner, documentId }, attempt());
  const [row] = (
    await admin.query(
      `select status, reject_code, page_count, risk_flags from library.documents where id = $1`,
      [documentId],
    )
  ).rows;
  return { owner, documentId, row };
};

describe("document.validate with real PDFs", () => {
  it("[document/upload#AC-1] rejects a renamed non-PDF and a truncated PDF", async () => {
    const renamed = await validated(
      Buffer.from("so um texto qualquer renomeado para .pdf".repeat(3)),
    );
    const truncated = await validated(truncatedPdf());

    expect(renamed.row).toMatchObject({ status: "REJECTED", reject_code: "PDF_INVALID" });
    expect(truncated.row).toMatchObject({ status: "REJECTED", reject_code: "PDF_INVALID" });
  });

  it("[document/upload#AC-3] records the active content it finds and still opens the document", async () => {
    const open = await validated(openActionPdf());
    const script = await validated(javascriptPdf());
    const plain = await validated(plainPdf());

    expect(open.row).toMatchObject({ status: "READY" });
    expect(open.row.risk_flags.openAction).toBeGreaterThan(0);
    expect(open.row.risk_flags.launch).toBeGreaterThan(0);
    expect(script.row.risk_flags.javascript).toBeGreaterThan(0);
    expect(plain.row.risk_flags).toEqual({});
  });

  it("[document/upload#AC-8] rejects a password-protected PDF and reads the page count of a valid one", async () => {
    const encrypted = await validated(encryptedPdf());
    const valid = await validated(plainPdf(5));

    expect(encrypted.row).toMatchObject({ status: "REJECTED", reject_code: "PDF_ENCRYPTED" });
    expect(valid.row).toMatchObject({ status: "READY", page_count: 5, reject_code: null });
  });

  it("[document/upload#AC-11] delivers every stage of the document through a pull", async () => {
    const { owner, documentId } = await uploaded(plainPdf(2));
    const stage = async () => {
      const { changes } = await engine.pull(db, owner, 0);
      return changes.find((c) => c.entityId === documentId)?.data as
        { status: string; pageCount: number | null; rejectCode: string | null } | undefined;
    };

    const before = await stage();
    await task({ ownerId: owner, documentId }, attempt());
    const after = await stage();

    expect(before).toMatchObject({ status: "VALIDATING", pageCount: null, rejectCode: null });
    expect(after).toMatchObject({ status: "READY", pageCount: 2, rejectCode: null });
  });

  it("[document/upload#AC-12] rejects with VALIDATION_FAILED when the last attempt fails", async () => {
    const { owner, documentId } = await uploaded(plainPdf());
    await admin.query(
      `update library.stored_files set storage_key = 'missing/object.pdf' where id = (select stored_file_id from library.documents where id = $1)`,
      [documentId],
    );

    await expect(task({ ownerId: owner, documentId }, attempt(1))).rejects.toThrow();
    await task({ ownerId: owner, documentId }, attempt(4));

    const [row] = (
      await admin.query(`select status, reject_code from library.documents where id = $1`, [
        documentId,
      ])
    ).rows;
    expect(row).toEqual({ status: "REJECTED", reject_code: "VALIDATION_FAILED" });
  });

  it("refuses a payload that is not made of ids", async () => {
    await expect(task({ ownerId: "x", documentId: "y" }, attempt())).rejects.toThrow();
  });
});
