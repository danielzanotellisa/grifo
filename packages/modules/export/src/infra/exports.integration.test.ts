import { localEngine } from "@embedpdf/engine";
import { createS3Storage, ensureS3Buckets, newId, s3ConfigFromEnv, type Db } from "@app/platform";
import { drizzle } from "drizzle-orm/node-postgres";
import { unzipSync } from "fflate";
import pg from "pg";
import initSqlJs from "sql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExports } from "./exports";

const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const db: Db = drizzle(appPool);
const storage = createS3Storage(s3ConfigFromEnv(process.env));
// The renderer is replaced by one that returns the HTML itself, so the tests can read what it was given.
const exports_ = createExports({
  db,
  storage,
  renderPdf: async (document) => new TextEncoder().encode(document.__html),
});

beforeAll(() => ensureS3Buckets(s3ConfigFromEnv(process.env)));
afterAll(async () => {
  await Promise.all([appPool.end(), admin.end()]);
});

const insert = (sql: string, params: unknown[]) => admin.query(sql, params);

const subject = async (owner: string, name: string) => {
  const id = newId();
  await insert(`insert into library.subjects (id, owner_id, name) values ($1, $2, $3)`, [
    id,
    owner,
    name,
  ]);
  return id;
};
const document = async (owner: string, subjectId: string, title: string, deleted = false) => {
  const id = newId();
  const file = newId();
  await insert(
    `insert into library.stored_files (id, owner_id, sha256, size_bytes, storage_key) values ($1, $2, $3, 1, $4)`,
    [file, owner, newId().replaceAll("-", "").repeat(2), `${owner}/${file}.pdf`],
  );
  await insert(
    `insert into library.documents (id, owner_id, subject_id, stored_file_id, title, status, page_count, deleted_at, deleted_root_id)
     values ($1, $2, $3, $4, $5, 'READY', 10, $6, $7)`,
    [id, owner, subjectId, file, title, deleted ? new Date() : null, deleted ? id : null],
  );
  return id;
};
const highlight = async (owner: string, documentId: string, pageIndex: number) => {
  const category = newId();
  const id = newId();
  await insert(
    `insert into annotation.categories (id, owner_id, name, color, role, position) values ($1, $2, 'Def', '#F7D04F', 'DEFINITION', 'a0')`,
    [category, owner],
  );
  await insert(
    `insert into annotation.highlights (id, owner_id, document_id, category_id, page_index, rects, quote)
     values ($1, $2, $3, $4, $5, '[]'::jsonb, '{"exact":"x","prefix":"","suffix":""}'::jsonb)`,
    [id, owner, documentId, category, pageIndex],
  );
  return id;
};
const node = async (owner: string, documentId: string, highlightId: string | null) => {
  const id = newId();
  await insert(
    `insert into outline.nodes (id, owner_id, document_id, position, highlight_id, role, text)
     values ($1, $2, $3, 'a0', $4, 'DEFINITION', 'texto')`,
    [id, owner, documentId, highlightId],
  );
  return id;
};
const card = async (
  owner: string,
  documentId: string,
  front: string,
  sourceNodeId: string | null = null,
  deleted = false,
) => {
  const id = newId();
  await insert(
    `insert into study.flashcards (id, owner_id, document_id, source_node_id, front, back, deleted_at, deleted_root_id)
     values ($1, $2, $3, $4, $5, 'verso', $6, $7)`,
    [id, owner, documentId, sourceNodeId, front, deleted ? new Date() : null, deleted ? id : null],
  );
  return id;
};

const run = async (owner: string, scope: "DOCUMENT" | "SUBJECT", scopeId: string) => {
  const { id } = await exports_.request(owner, { kind: "FLASHCARDS_APKG", scope, scopeId });
  await exports_.run(owner, id, { lastAttempt: false });
  return { id, status: await exports_.get(owner, id) };
};
const notesOf = async (url: string) => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database(unzipSync(bytes)["collection.anki2"]);
  const out = sqlite.exec("select guid, flds, tags from notes order by guid")[0]?.values ?? [];
  const decks = JSON.parse(sqlite.exec("select decks from col")[0]!.values[0]![0] as string);
  return {
    notes: out as [string, string, string][],
    decks: Object.values(decks as Record<string, { name: string }>).map((d) => d.name),
  };
};

describe("export of a flashcard deck", () => {
  it("[export/apkg#AC-1] [export/apkg#AC-7] builds the package of a document from its live cards, with source and tags", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const d = await document(owner, s, "TCP");
    const h = await highlight(owner, d, 2);
    const n = await node(owner, d, h);
    const kept = await card(owner, d, "O que é TCP?", n);
    await card(owner, d, "Apagado", n, true);
    const gone = await document(owner, s, "Removido", true);
    await card(owner, gone, "De documento apagado");

    const { status } = await run(owner, "DOCUMENT", d);

    expect(status).toMatchObject({ status: "SUCCEEDED", error: null });
    const { notes, decks } = await notesOf(status.downloadUrl!);
    expect(decks).toContain("Redes::TCP");
    expect(notes).toEqual([
      [`grifo-${kept}`, "O que é TCP?\u001fverso\u001fRedes › TCP, p. 3", " Redes TCP page_3 "],
    ]);
  });

  it("[export/apkg#AC-2] makes one deck per live document for a subject, and an empty one for a subject with no cards", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const tcp = await document(owner, s, "TCP");
    const udp = await document(owner, s, "UDP");
    await card(owner, tcp, "a");
    await card(owner, tcp, "b");
    await card(owner, udp, "c");
    const empty = await subject(owner, "Vazia");

    const full = await run(owner, "SUBJECT", s);
    const none = await run(owner, "SUBJECT", empty);

    const { notes, decks } = await notesOf(full.status.downloadUrl!);
    expect(notes).toHaveLength(3);
    expect(decks.sort()).toEqual(["Default", "Redes::TCP", "Redes::UDP"]);
    expect(none.status.status).toBe("SUCCEEDED");
    expect((await notesOf(none.status.downloadUrl!)).notes).toEqual([]);
  });

  it("[export/apkg#AC-4] tags with spaces become underscores and a card without a highlight has no page", async () => {
    const owner = newId();
    const s = await subject(owner, "Banco de Dados");
    const d = await document(owner, s, "Aula 1");
    await card(owner, d, "a", await node(owner, d, null));

    const { status } = await run(owner, "DOCUMENT", d);

    const { notes } = await notesOf(status.downloadUrl!);
    expect(notes[0]![2]).toBe(" Banco_de_Dados Aula_1 ");
    expect(notes[0]![1]).toContain("Banco de Dados › Aula 1");
    expect(notes[0]![1]).not.toContain(", p.");
  });

  it("[export/apkg#AC-5] refuses a scope that is missing, deleted or of another user", async () => {
    const owner = newId();
    const other = newId();
    const s = await subject(owner, "Redes");
    const deleted = await document(owner, s, "Fora", true);
    const ask = (user: string, scope: "DOCUMENT" | "SUBJECT", scopeId: string) =>
      exports_.request(user, { kind: "FLASHCARDS_APKG", scope, scopeId });

    await expect(ask(owner, "DOCUMENT", newId())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ask(owner, "DOCUMENT", deleted)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ask(other, "SUBJECT", s)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      exports_.request(owner, { kind: "FULL_DATA", scope: "DOCUMENT", scopeId: s }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      exports_.request(owner, { kind: "FLASHCARDS_APKG", scope: "ACCOUNT", scopeId: s }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("[export/apkg#AC-6] answers the state without a URL before the job, and 404 for another user's export", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const { id } = await exports_.request(owner, {
      kind: "FLASHCARDS_APKG",
      scope: "SUBJECT",
      scopeId: s,
    });

    expect(await exports_.get(owner, id)).toEqual({ id, status: "QUEUED", error: null });
    await expect(exports_.get(newId(), id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(exports_.get(owner, newId())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("[export/apkg#AC-7] enqueues one job with the request and fails the export on the last attempt", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const { id } = await exports_.request(owner, {
      kind: "FLASHCARDS_APKG",
      scope: "SUBJECT",
      scopeId: s,
    });
    const jobs = await admin.query(
      `select t.identifier from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id where j.payload->>'exportId' = $1`,
      [id],
    );
    expect(jobs.rows).toEqual([{ identifier: "export.render" }]);

    await insert(`update library.subjects set name = name where id = $1`, [s]);
    const broken = createExports({
      db,
      storage: { ...storage, put: () => Promise.reject(new Error("storage down")) },
    });
    await expect(broken.run(owner, id, { lastAttempt: false })).rejects.toThrow("storage down");
    await broken.run(owner, id, { lastAttempt: true });

    expect(await exports_.get(owner, id)).toEqual({
      id,
      status: "FAILED",
      error: { code: "EXPORT_FAILED", message: expect.any(String) },
    });
  });

  it("[export/apkg#AC-7] never reads another user's cards", async () => {
    const owner = newId();
    const other = newId();
    const s = await subject(owner, "Redes");
    const d = await document(owner, s, "TCP");
    await card(other, d, "de outro dono");

    const { status } = await run(owner, "DOCUMENT", d);

    expect((await notesOf(status.downloadUrl!)).notes).toEqual([]);
  });
});

const textOf = async (url: string) => (await fetch(url)).text();
const summary = async (owner: string, scope: "DOCUMENT" | "SUBJECT", scopeId: string) => {
  const { id } = await exports_.request(owner, { kind: "SUMMARY_PDF", scope, scopeId });
  await exports_.run(owner, id, { lastAttempt: false });
  return { id, status: await exports_.get(owner, id) };
};
const freeNode = async (
  owner: string,
  documentId: string,
  position: string,
  role: string,
  text: string,
  deleted = false,
) =>
  insert(
    `insert into outline.nodes (id, owner_id, document_id, position, role, text, deleted_at, deleted_root_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      newId(),
      owner,
      documentId,
      position,
      role,
      text,
      deleted ? new Date() : null,
      deleted ? newId() : null,
    ],
  );

describe("export of a summary PDF", () => {
  it("[export/summary-pdf#AC-4] records the template and refuses a scope that is missing or another user's", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const d = await document(owner, s, "TCP");

    const { id } = await exports_.request(owner, {
      kind: "SUMMARY_PDF",
      scope: "DOCUMENT",
      scopeId: d,
    });

    const row = await admin.query(
      `select template_id, template_version from export.exports where id = $1`,
      [id],
    );
    expect(row.rows).toEqual([{ template_id: "classic", template_version: 1 }]);
    await expect(
      exports_.request(newId(), { kind: "SUMMARY_PDF", scope: "DOCUMENT", scopeId: d }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      exports_.request(owner, { kind: "SUMMARY_PDF", scope: "SUBJECT", scopeId: newId() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("[export/summary-pdf#AC-5] renders the live nodes of the document in order, with the page, and names the file after it", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const d = await document(owner, s, "TCP & UDP");
    const h = await highlight(owner, d, 2);
    await node(owner, d, h);
    await freeNode(owner, d, "a", "TOPIC", "Camadas");
    await freeNode(owner, d, "a9", "ITEM", "Apagado", true);
    await freeNode(newId(), d, "a1", "ITEM", "De outro dono");

    const { status } = await summary(owner, "DOCUMENT", d);

    expect(status.status).toBe("SUCCEEDED");
    const out = await textOf(status.downloadUrl!);
    expect(out).toContain("<h1>TCP &amp; UDP</h1>");
    expect(out.indexOf("Camadas")).toBeLessThan(out.indexOf("texto"));
    expect(out).toContain("p. 3");
    expect(out).not.toContain("Apagado");
    expect(out).not.toContain("De outro dono");
    expect(decodeURIComponent(status.downloadUrl!)).toContain("TCP  UDP.pdf");
    const key = await admin.query(`select result_key from export.exports where id = $1`, [
      status.id,
    ]);
    expect(key.rows[0].result_key).toBe(`${owner}/exports/${status.id}.pdf`);
  });

  it("[export/summary-pdf#AC-5] renders a section for each live document of a subject, by title", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const udp = await document(owner, s, "UDP");
    const tcp = await document(owner, s, "TCP");
    const gone = await document(owner, s, "Removido", true);
    await freeNode(owner, udp, "a0", "ITEM", "no udp");
    await freeNode(owner, tcp, "a0", "ITEM", "no tcp");
    await freeNode(owner, gone, "a0", "ITEM", "no removido");

    const { status } = await summary(owner, "SUBJECT", s);

    const out = await textOf(status.downloadUrl!);
    expect(out.indexOf("<h1>TCP</h1>")).toBeLessThan(out.indexOf("<h1>UDP</h1>"));
    expect(out).toContain("no tcp");
    expect(out).toContain("no udp");
    expect(out).not.toContain("Removido");
    expect(out).toContain("Redes");
    expect(decodeURIComponent(status.downloadUrl!)).toContain("Redes.pdf");
  });

  it("[export/summary-pdf#AC-5] fails the export on the last attempt when the renderer fails", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const { id } = await exports_.request(owner, {
      kind: "SUMMARY_PDF",
      scope: "SUBJECT",
      scopeId: s,
    });
    const broken = createExports({
      db,
      storage,
      renderPdf: () => Promise.reject(new Error("renderer down")),
    });

    await expect(broken.run(owner, id, { lastAttempt: false })).rejects.toThrow("renderer down");
    await broken.run(owner, id, { lastAttempt: true });

    expect(await exports_.get(owner, id)).toMatchObject({ status: "FAILED" });
  });
});

const ORIGINAL = new Uint8Array(
  Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] >>\nendobj\ntrailer\n<< /Size 4 /Root 1 0 R >>\n%%EOF\n",
    "latin1",
  ),
);
/** A READY document whose original is a real PDF in the storage. */
const pdfDocument = async (
  owner: string,
  subjectId: string,
  opts: { title?: string; status?: string; riskFlags?: object } = {},
) => {
  const id = newId();
  const file = newId();
  const key = `${owner}/${file}.pdf`;
  await storage.put("originals", key, Buffer.from(ORIGINAL), "application/pdf");
  await insert(
    `insert into library.stored_files (id, owner_id, sha256, size_bytes, storage_key) values ($1, $2, $3, $4, $5)`,
    [file, owner, newId().replaceAll("-", "").repeat(2), ORIGINAL.length, key],
  );
  await insert(
    `insert into library.documents (id, owner_id, subject_id, stored_file_id, title, status, page_count, risk_flags)
     values ($1, $2, $3, $4, $5, $6, 1, $7)`,
    [
      id,
      owner,
      subjectId,
      file,
      opts.title ?? "Aula",
      opts.status ?? "READY",
      JSON.stringify(opts.riskFlags ?? {}),
    ],
  );
  return id;
};
const mark = async (
  owner: string,
  documentId: string,
  color: string,
  rects: object[],
  deleted = false,
) => {
  const category = newId();
  const id = newId();
  await insert(
    `insert into annotation.categories (id, owner_id, name, color, role, position) values ($1, $2, $3, $4, 'ITEM', 'a0')`,
    [category, owner, `cat-${category}`, color],
  );
  await insert(
    `insert into annotation.highlights (id, owner_id, document_id, category_id, page_index, rects, quote, deleted_at, deleted_root_id)
     values ($1, $2, $3, $4, 0, $5::jsonb, '{"exact":"x","prefix":"","suffix":""}'::jsonb, $6, $7)`,
    [
      id,
      owner,
      documentId,
      category,
      JSON.stringify(rects),
      deleted ? new Date() : null,
      deleted ? id : null,
    ],
  );
};
const annotated = async (owner: string, documentId: string) => {
  const { id } = await exports_.request(owner, {
    kind: "ANNOTATED_PDF",
    scope: "DOCUMENT",
    scopeId: documentId,
  });
  await exports_.run(owner, id, { lastAttempt: false });
  return { id, status: await exports_.get(owner, id) };
};
const bytesOf = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

describe("export of an annotated PDF", () => {
  it("[export/annotated-pdf#AC-3] accepts a document and refuses a subject, or a document that is missing, deleted, not ready or foreign", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const ready = await pdfDocument(owner, s);
    const validating = await pdfDocument(owner, s, { status: "VALIDATING" });
    const gone = await document(owner, s, "Removido", true);
    const ask = (user: string, scope: "DOCUMENT" | "SUBJECT", scopeId: string) =>
      exports_.request(user, { kind: "ANNOTATED_PDF", scope, scopeId });

    await expect(ask(owner, "DOCUMENT", ready)).resolves.toMatchObject({ id: expect.any(String) });
    await expect(ask(owner, "SUBJECT", s)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    for (const [user, id] of [
      [owner, newId()],
      [owner, gone],
      [owner, validating],
      [newId(), ready],
    ] as const) {
      await expect(ask(user, "DOCUMENT", id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("[export/annotated-pdf#AC-4] writes the live highlights of the owner on the original and names the file", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const d = await pdfDocument(owner, s, { title: "Aula 1" });
    await mark(owner, d, "#F7D04F", [{ x1: 20, y1: 100, x2: 120, y2: 114 }]);
    await mark(owner, d, "#FF0000", [{ x1: 20, y1: 50, x2: 60, y2: 64 }], true);
    await mark(newId(), d, "#00FF00", [{ x1: 5, y1: 5, x2: 9, y2: 9 }]);

    const { status } = await annotated(owner, d);

    expect(status.status).toBe("SUCCEEDED");
    expect(decodeURIComponent(status.downloadUrl!)).toContain("Aula 1 (marcado).pdf");
    const bytes = await bytesOf(status.downloadUrl!);
    expect(Buffer.from(bytes).subarray(0, ORIGINAL.length).equals(Buffer.from(ORIGINAL))).toBe(
      true,
    );
    const doc = await localEngine().open({ kind: "bytes", bytes });
    const { pages } = await doc.pages.list();
    const { annotations } = await doc.page(pages[0]!.ref).annotations.list();
    expect(
      annotations.flatMap((a) => (a.subtype === "highlight" ? [a.color.toLowerCase()] : [])),
    ).toEqual(["#f7d04f"]);
    const key = await admin.query(`select result_key from export.exports where id = $1`, [
      status.id,
    ]);
    expect(key.rows[0].result_key).toBe(`${owner}/exports/${status.id}.pdf`);
  });

  it("[export/annotated-pdf#AC-5] fails at once, with its code, a document that has active content", async () => {
    const owner = newId();
    const s = await subject(owner, "Redes");
    const d = await pdfDocument(owner, s, { riskFlags: { javascript: 1 } });
    const { id } = await exports_.request(owner, {
      kind: "ANNOTATED_PDF",
      scope: "DOCUMENT",
      scopeId: d,
    });

    await exports_.run(owner, id, { lastAttempt: false });

    expect(await exports_.get(owner, id)).toMatchObject({
      status: "FAILED",
      error: { code: "EXPORT_ACTIVE_CONTENT" },
    });
  });
});
