import { createDb, createS3Storage, newId, s3ConfigFromEnv } from "@app/platform";
import pg from "pg";

export const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
export const adminDb = createDb(process.env.DATABASE_MIGRATOR_URL ?? "");
export const config = s3ConfigFromEnv(process.env);
export const storage = createS3Storage(config);

export const rows = async (sql: string, params: unknown[] = []) =>
  (await admin.query(sql, params)).rows;
export const exists = async (table: string, id: string) =>
  (await rows(`select 1 from ${table} where id = $1`, [id])).length === 1;

/** `old` rows were deleted 31 days ago, `recent` ones 29 days ago, `live` ones never. */
export type Age = "old" | "recent" | "live";
export const deletion = (age: Age, id: string): string =>
  age === "live" ? "null, null" : `now() - interval '${age === "old" ? 31 : 29} days', '${id}'`;
export const SHA = () => newId().replaceAll("-", "").padEnd(64, "0");

export const subject = async (owner: string, age: Age = "live", rootId?: string) => {
  const id = newId();
  await admin.query(
    `insert into library.subjects (id, owner_id, name, deleted_at, deleted_root_id) values ($1, $2, 'Redes', ${deletion(age, rootId ?? id)})`,
    [id, owner],
  );
  return id;
};
export const storedFile = async (
  owner: string,
  opts: { createdDaysAgo?: number; sha?: string } = {},
) => {
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
export const document = async (
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
export const category = async (owner: string, age: Age = "live") => {
  const id = newId();
  await admin.query(
    `insert into annotation.categories (id, owner_id, name, color, role, position, deleted_at, deleted_root_id)
     values ($1, $2, 'Definição', '#ff0000', 'DEFINITION', 'a0', ${deletion(age, id)})`,
    [id, owner],
  );
  return id;
};
export const highlight = async (
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
export const node = async (
  owner: string,
  documentId: string,
  age: Age = "live",
  rootId?: string,
) => {
  const id = newId();
  await admin.query(
    `insert into outline.nodes (id, owner_id, document_id, position, role, text, deleted_at, deleted_root_id)
     values ($1, $2, $3, 'a0', 'TOPIC', 'Tópico', ${deletion(age, rootId ?? id)})`,
    [id, owner, documentId],
  );
  return id;
};
export const flashcard = async (
  owner: string,
  documentId: string,
  age: Age = "live",
  rootId?: string,
) => {
  const id = newId();
  await admin.query(
    `insert into study.flashcards (id, owner_id, document_id, front, back, deleted_at, deleted_root_id)
     values ($1, $2, $3, 'frente', 'verso', ${deletion(age, rootId ?? id)})`,
    [id, owner, documentId],
  );
  return id;
};
export const exportRow = async (owner: string, age: Age, resultKey?: string) => {
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
export const world = async (owner: string, age: Age) => {
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
export const TABLES = {
  subject: "library.subjects",
  document: "library.documents",
  category: "annotation.categories",
  highlight: "annotation.highlights",
  node: "outline.nodes",
  flashcard: "study.flashcards",
  export: "export.exports",
} as const;
export const present = async (w: Awaited<ReturnType<typeof world>>) =>
  Object.fromEntries(
    await Promise.all(
      (Object.keys(TABLES) as (keyof typeof TABLES)[]).map(
        async (key) => [key, await exists(TABLES[key], w[key])] as const,
      ),
    ),
  );
export const ALL = (value: boolean) =>
  Object.fromEntries(Object.keys(TABLES).map((key) => [key, value]));
