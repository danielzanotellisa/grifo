import { newId, outlineNodeIdForHighlight, type Mutation } from "@app/platform";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { db, syncEngine, trash } from "./composition";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });

afterAll(() => admin.end());

const mutation = (entity: string, op: "upsert" | "delete", data: unknown): Mutation => ({
  mutationId: newId(),
  entity,
  op,
  data,
});
const send = async (owner: string, m: Mutation) =>
  (await syncEngine.push(db, owner, [m])).results[0]!;
const applied = async (owner: string, m: Mutation) =>
  expect((await send(owner, m)).status).toBe("applied");
const rejected = (code: string) => expect.objectContaining({ status: "rejected", code });

let counter = 0;
const newCategory = async (owner: string, role: "TOPIC" | "DEFINITION" | "ITEM" | "IGNORE") => {
  counter += 1;
  const data = {
    id: newId(),
    name: `Cat ${counter}`,
    color: "#4F8EF7",
    role,
    shortcut: null,
    position: `a${counter}`,
  };
  await applied(owner, mutation("category", "upsert", data));
  return data;
};

/** A subject with one READY document. The document is created by the upload, so it is seeded directly. */
const newSubjectWithDocument = async (owner: string) => {
  const [subjectId, fileId, documentId] = [newId(), newId(), newId()];
  await applied(owner, mutation("subject", "upsert", { id: subjectId, name: "Redes" }));
  await admin.query(
    `insert into library.stored_files (id, owner_id, sha256, size_bytes, storage_key) values ($1, $2, $3, 10, $4)`,
    [fileId, owner, fileId.replaceAll("-", "").padEnd(64, "0"), `${owner}/${fileId}.pdf`],
  );
  await admin.query(
    `insert into library.documents (id, owner_id, subject_id, stored_file_id, title, status, page_count)
     values ($1, $2, $3, $4, 'TCP', 'READY', 30)`,
    [documentId, owner, subjectId, fileId],
  );
  return { subjectId, documentId };
};

const markPassage = async (
  owner: string,
  documentId: string,
  categoryId: string,
  exact: string,
) => {
  const id = newId();
  await applied(
    owner,
    mutation("highlight", "upsert", {
      id,
      documentId,
      categoryId,
      pageIndex: 2,
      rects: [{ x1: 10, y1: 600, x2: 300, y2: 612 }],
      quote: { exact, prefix: "", suffix: "" },
      note: null,
    }),
  );
  return { highlightId: id, nodeId: outlineNodeIdForHighlight(id) };
};

const count = async (sql: string, params: unknown[]) =>
  (await admin.query(sql, params)).rows[0].n as number;
const live = (table: string, column: string, id: string) =>
  count(`select count(*)::int as n from ${table} where ${column} = $1 and deleted_at is null`, [
    id,
  ]);
const cardOf = async (id: string) =>
  (
    await admin.query<{ back: string; source_node_id: string; deleted_at: Date | null }>(
      `select back, source_node_id, deleted_at from study.flashcards where id = $1`,
      [id],
    )
  ).rows[0];

describe("a flashcard from a highlight", () => {
  it("[flashcard#AC-11] takes the quote as back when the category of the highlight is DEFINITION", async () => {
    const owner = newId();
    const { documentId } = await newSubjectWithDocument(owner);
    const definition = await newCategory(owner, "DEFINITION");
    const { nodeId } = await markPassage(
      owner,
      documentId,
      definition.id,
      "protocolo orientado a conexão",
    );
    const id = newId();

    await applied(
      owner,
      mutation("flashcard", "upsert", { id, sourceNodeId: nodeId, front: "TCP" }),
    );

    expect(await cardOf(id)).toMatchObject({
      back: "protocolo orientado a conexão",
      source_node_id: nodeId,
    });
  });

  it("[flashcard#AC-11] refuses a highlight whose category is not DEFINITION", async () => {
    const owner = newId();
    const { documentId } = await newSubjectWithDocument(owner);
    const example = await newCategory(owner, "ITEM");
    const { nodeId } = await markPassage(owner, documentId, example.id, "um exemplo");

    expect(
      await send(
        owner,
        mutation("flashcard", "upsert", { id: newId(), sourceNodeId: nodeId, front: "x" }),
      ),
    ).toEqual(rejected("FLASHCARD_REQUIRES_DEFINITION"));
  });

  it("[flashcard#AC-13] keeps the card when the category becomes IGNORE, and updates again when it stops", async () => {
    const owner = newId();
    const { documentId } = await newSubjectWithDocument(owner);
    const definition = await newCategory(owner, "DEFINITION");
    const { nodeId } = await markPassage(owner, documentId, definition.id, "texto do highlight");
    const id = newId();
    await applied(
      owner,
      mutation("flashcard", "upsert", { id, sourceNodeId: nodeId, front: "Termo" }),
    );

    await applied(owner, mutation("category", "upsert", { ...definition, role: "IGNORE" }));
    expect(await live("outline.nodes", "id", nodeId)).toBe(0);
    expect(await cardOf(id)).toMatchObject({ source_node_id: nodeId, deleted_at: null });
    expect(
      await send(owner, mutation("flashcard", "upsert", { id, refreshFromSource: true })),
    ).toEqual(rejected("FLASHCARD_SOURCE_GONE"));

    await applied(owner, mutation("category", "upsert", { ...definition, role: "DEFINITION" }));
    expect(await live("outline.nodes", "id", nodeId)).toBe(1);
    await applied(owner, mutation("flashcard", "upsert", { id, refreshFromSource: true }));
  });
});

describe("a deleted subject", () => {
  it("[subject#AC-1] takes documents, highlights, nodes and flashcards, and brings them all back", async () => {
    const owner = newId();
    const { subjectId, documentId } = await newSubjectWithDocument(owner);
    const definition = await newCategory(owner, "DEFINITION");
    const { highlightId, nodeId } = await markPassage(
      owner,
      documentId,
      definition.id,
      "conceito importante",
    );
    const cardId = newId();
    await applied(
      owner,
      mutation("flashcard", "upsert", { id: cardId, sourceNodeId: nodeId, front: "Conceito" }),
    );

    await applied(owner, mutation("subject", "delete", { id: subjectId }));

    expect(await live("library.documents", "id", documentId)).toBe(0);
    expect(await live("annotation.highlights", "id", highlightId)).toBe(0);
    expect(await live("outline.nodes", "id", nodeId)).toBe(0);
    expect(await live("study.flashcards", "id", cardId)).toBe(0);
    expect((await trash.list(db, owner)).map((i) => i.id)).toEqual([subjectId]);

    await trash.restore(db, owner, subjectId);

    expect(await live("library.subjects", "id", subjectId)).toBe(1);
    expect(await live("library.documents", "id", documentId)).toBe(1);
    expect(await live("annotation.highlights", "id", highlightId)).toBe(1);
    expect(await live("outline.nodes", "id", nodeId)).toBe(1);
    expect(await cardOf(cardId)).toMatchObject({ source_node_id: nodeId, deleted_at: null });
  });
});
