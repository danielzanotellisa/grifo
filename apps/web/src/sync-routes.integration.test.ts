import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { GET as meRoute } from "./app/api/me/route";
import { GET as verifyRoute } from "./app/api/auth/[...all]/route";
import { POST as authPost } from "./app/api/auth/[...all]/route";
import { POST as pushRoute } from "./app/api/sync/push/route";
import { GET as pullRoute } from "./app/api/sync/pull/route";
import { GET as trashRoute } from "./app/api/trash/route";
import { POST as restoreRoute } from "./app/api/trash/[id]/restore/route";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "senha-bem-forte-123";
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
afterAll(() => admin.end());

let counter = 0;
let ips = 0;
const call = (
  path: string,
  init: { method?: string; body?: string; cookie?: string; origin?: string | null } = {},
) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-real-ip": `10.7.${(ips >> 8) & 255}.${++ips & 255}`,
      ...(init.origin === null ? {} : { origin: init.origin ?? ORIGIN }),
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    ...(init.body === undefined ? {} : { body: init.body }),
  });
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
const mailUrl = async (address: string) => {
  for (let i = 0; i < 120; i++) {
    const { rows } = await admin.query(
      `select url from identity.outgoing_mail where to_email = $1 and kind = 'verification' order by created_at desc limit 1`,
      [address],
    );
    if (rows[0]) return rows[0].url as string;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`no mail for ${address}`);
};
const signedIn = async (): Promise<string> => {
  const address = `sync${++counter}-${Date.now()}@example.com`;
  const body = (value: object) => JSON.stringify(value);
  await authPost(
    call("/api/auth/sign-up/email", {
      method: "POST",
      body: body({ name: "Sync", email: address, password: PASSWORD }),
    }),
  );
  await verifyRoute(new Request(await mailUrl(address)));
  const res = await authPost(
    call("/api/auth/sign-in/email", {
      method: "POST",
      body: body({ email: address, password: PASSWORD }),
    }),
  );
  return cookieOf(res);
};

type Mutation = { mutationId: string; entity: string; op: "upsert" | "delete"; data: unknown };
const upsertSubject = (id: string, name: string): Mutation => ({
  mutationId: randomUUID(),
  entity: "subject",
  op: "upsert",
  data: { id, name },
});
const deleteOf = (entity: string, id: string): Mutation => ({
  mutationId: randomUUID(),
  entity,
  op: "delete",
  data: { id },
});
const push = (cookie: string | undefined, mutations: unknown, extra = {}) =>
  pushRoute(
    call("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({ mutations }),
      ...(cookie ? { cookie } : {}),
      ...extra,
    }),
  );
const pull = (cookie: string | undefined, query = "") =>
  pullRoute(call(`/api/sync/pull${query}`, cookie ? { cookie } : {}));
const trash = (cookie?: string) => trashRoute(call("/api/trash", cookie ? { cookie } : {}));
const restore = (cookie: string | undefined, id: string, extra = {}) =>
  restoreRoute(
    call(`/api/trash/${id}/restore`, { method: "POST", ...(cookie ? { cookie } : {}), ...extra }),
    {
      params: Promise.resolve({ id }),
    },
  );
const subjectsOf = (changes: { entity: string }[]) => changes.filter((c) => c.entity === "subject");
/** Documents come from the upload, not from sync, so the test inserts one directly. */
const insertDocument = async (cookie: string, id: string, subjectId: string, title: string) => {
  const { userId } = (await (await meRoute(call("/api/me", { cookie }))).json()) as {
    userId: string;
  };
  const fileId = randomUUID();
  await admin.query(
    `insert into library.stored_files (id, owner_id, sha256, size_bytes, storage_key) values ($1, $2, $3, 1, $4)`,
    [fileId, userId, randomUUID().replaceAll("-", "").padEnd(64, "0"), `k/${fileId}`],
  );
  await admin.query(
    `insert into library.documents (id, owner_id, subject_id, stored_file_id, title, status, page_count)
     values ($1, $2, $3, $4, $5, 'READY', 1)`,
    [id, userId, subjectId, fileId, title],
  );
};
const code = async (res: Response) => ((await res.clone().json()) as { code?: string }).code;
const subjectCount = async (id: string) =>
  (await admin.query(`select 1 from library.subjects where id = $1`, [id])).rowCount;

describe("sync routes", () => {
  it("[_cross-cutting/sync#AC-13] answers 401 without a session and applies nothing", async () => {
    const id = randomUUID();

    const res = await push(undefined, [upsertSubject(id, "Direito")]);
    const pulled = await pull(undefined);

    expect(res.status).toBe(401);
    expect(await code(res)).toBe("UNAUTHENTICATED");
    expect(pulled.status).toBe(401);
    expect(await subjectCount(id)).toBe(0);
  });

  it("[_cross-cutting/sync#AC-14] refuses a push from a foreign or missing origin", async () => {
    const cookie = await signedIn();
    const id = randomUUID();

    const foreign = await push(cookie, [upsertSubject(id, "Direito")], {
      origin: "https://evil.example",
    });
    const missing = await push(cookie, [upsertSubject(id, "Direito")], { origin: null });

    expect([foreign.status, missing.status]).toEqual([403, 403]);
    expect(await code(foreign)).toBe("FORBIDDEN_ORIGIN");
    expect(await subjectCount(id)).toBe(0);
  });

  it("[_cross-cutting/sync#AC-15] answers 400 to a malformed push and applies nothing", async () => {
    const cookie = await signedIn();
    const id = randomUUID();
    const valid = upsertSubject(id, "Direito");
    const bad: unknown[] = [
      [],
      Array.from({ length: 101 }, () => upsertSubject(randomUUID(), "x")),
      [{ ...valid, mutationId: "not-a-uuid" }],
      [{ ...valid, op: "patch" }],
      [{ ...valid, entity: "" }],
      [{ ...valid, data: "text" }],
      [{ mutationId: randomUUID() }],
    ];

    for (const mutations of bad) {
      const res = await push(cookie, mutations);
      expect(res.status).toBe(400);
      expect(await code(res)).toBe("VALIDATION_FAILED");
    }
    const notJson = await pushRoute(
      call("/api/sync/push", { method: "POST", body: "{nope", cookie }),
    );
    const noMutations = await pushRoute(
      call("/api/sync/push", { method: "POST", body: "{}", cookie }),
    );
    const huge = await push(cookie, [
      { ...valid, data: { id, name: "x".repeat(1024 * 1024 + 1) } },
    ]);

    expect([notJson.status, noMutations.status]).toEqual([400, 400]);
    expect(huge.status).toBe(413);
    expect(await code(huge)).toBe("PAYLOAD_TOO_LARGE");
    expect(await subjectCount(id)).toBe(0);
  });

  it("[_cross-cutting/sync#AC-16] pushes, pulls and answers duplicate on a resend", async () => {
    const cookie = await signedIn();
    const id = randomUUID();
    const batch = [upsertSubject(id, "Direito")];

    const first = (await (await push(cookie, batch)).json()) as {
      results: { status: string }[];
      cursor: number;
    };
    const pulled = (await (await pull(cookie, "?since=0")).json()) as {
      changes: { entity: string; entityId: string; op: string; data?: unknown }[];
      cursor: number;
      more: boolean;
    };
    const again = (await (await push(cookie, batch)).json()) as { results: { status: string }[] };

    expect(first.results.map((r) => r.status)).toEqual(["applied"]);
    expect({ ...pulled, changes: subjectsOf(pulled.changes) }).toEqual({
      changes: [{ entity: "subject", entityId: id, op: "upsert", data: { id, name: "Direito" } }],
      cursor: first.cursor,
      more: false,
    });
    expect(again.results.map((r) => r.status)).toEqual(["duplicate"]);
  });

  it("[_cross-cutting/sync#AC-17] validates since and defaults it to 0", async () => {
    const cookie = await signedIn();
    await push(cookie, [upsertSubject(randomUUID(), "Direito")]);

    for (const since of ["-1", "1.5", "abc", ""]) {
      const res = await pull(cookie, `?since=${since}`);
      expect(res.status).toBe(400);
      expect(await code(res)).toBe("VALIDATION_FAILED");
    }
    const first = (await (await pull(cookie)).json()) as { changes: unknown[] };
    const explicit = (await (await pull(cookie, "?since=0")).json()) as { changes: unknown[] };

    expect(subjectsOf(first.changes as { entity: string }[])).toHaveLength(1);
    expect(first).toEqual(explicit);
  });

  it("[_cross-cutting/sync#AC-18] rejects a mutation on another user's entity", async () => {
    const owner = await signedIn();
    const intruder = await signedIn();
    const id = randomUUID();
    await push(owner, [upsertSubject(id, "Direito")]);

    const res = (await (
      await push(intruder, [upsertSubject(id, "Invadido"), deleteOf("subject", id)])
    ).json()) as { results: { status: string; code?: string }[] };
    const intruderPull = (await (await pull(intruder)).json()) as { changes: { entity: string }[] };
    const ownerPull = (await (await pull(owner)).json()) as {
      changes: { entity: string; data?: { name: string } }[];
    };

    expect(res.results).toMatchObject([
      { status: "rejected", code: "NOT_FOUND" },
      { status: "rejected", code: "NOT_FOUND" },
    ]);
    expect(subjectsOf(intruderPull.changes)).toEqual([]);
    expect(
      subjectsOf(ownerPull.changes).map((c) => (c as { data?: { name: string } }).data?.name),
    ).toEqual(["Direito"]);
  });
});

describe("trash routes", () => {
  it("[_cross-cutting/soft-delete#AC-8] answers 401 without a session and 403 for a foreign origin", async () => {
    const cookie = await signedIn();
    const id = randomUUID();
    await push(cookie, [upsertSubject(id, "Direito")]);
    await push(cookie, [deleteOf("subject", id)]);

    const list = await trash();
    const noSession = await restore(undefined, id);
    const foreign = await restore(cookie, id, { origin: "https://evil.example" });

    expect([list.status, noSession.status, foreign.status]).toEqual([401, 401, 403]);
    expect(await code(foreign)).toBe("FORBIDDEN_ORIGIN");
    expect(await subjectCount(id)).toBe(1);
    const { rows } = await admin.query(`select deleted_at from library.subjects where id = $1`, [
      id,
    ]);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it("[_cross-cutting/soft-delete#AC-9] lists only the caller's trash items, newest first", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const [first, second, other] = [randomUUID(), randomUUID(), randomUUID()];
    await push(a, [upsertSubject(first, "Primeira"), upsertSubject(second, "Segunda")]);
    await push(b, [upsertSubject(other, "Alheia")]);
    await push(a, [deleteOf("subject", first)]);
    await push(a, [deleteOf("subject", second)]);
    await push(b, [deleteOf("subject", other)]);

    const body = (await (await trash(a)).json()) as {
      items: { entity: string; id: string; label: string; deletedAt: string }[];
    };

    expect(body.items.map(({ entity, id, label }) => ({ entity, id, label }))).toEqual([
      { entity: "subject", id: second, label: "Segunda" },
      { entity: "subject", id: first, label: "Primeira" },
    ]);
    expect(Date.parse(body.items[0]!.deletedAt)).not.toBeNaN();
  });

  it("[_cross-cutting/soft-delete#AC-10] restores over HTTP and hides what is not restorable", async () => {
    const owner = await signedIn();
    const intruder = await signedIn();
    const [subject, parent, child] = [randomUUID(), randomUUID(), randomUUID()];
    await push(owner, [upsertSubject(subject, "Direito"), upsertSubject(parent, "Civil")]);
    await insertDocument(owner, child, parent, "Aula");
    const cursor = (
      (await (await push(owner, [deleteOf("subject", subject)])).json()) as { cursor: number }
    ).cursor;
    await push(owner, [deleteOf("document", child)]);
    await push(owner, [deleteOf("subject", parent)]);

    const foreign = await restore(intruder, subject);
    const notUuid = await restore(owner, "nope");
    const parentGone = await restore(owner, child);
    const ok = await restore(owner, subject);
    const pulled = (await (await pull(owner, `?since=${cursor}`)).json()) as {
      changes: { entity: string; entityId: string; op: string }[];
    };

    expect([foreign.status, notUuid.status]).toEqual([404, 404]);
    expect(await code(foreign)).toBe("NOT_FOUND");
    expect(parentGone.status).toBe(422);
    expect(await code(parentGone)).toBe("PARENT_DELETED");
    expect(ok.status).toBe(204);
    expect(pulled.changes).toContainEqual(
      expect.objectContaining({ entity: "subject", entityId: subject, op: "upsert" }),
    );
  });
});
