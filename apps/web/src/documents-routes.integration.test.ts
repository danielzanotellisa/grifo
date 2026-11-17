import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GET as fileRoute } from "./app/api/documents/[id]/file/route";
import { POST as confirmRoute } from "./app/api/documents/[id]/confirm/route";
import { POST as startRoute } from "./app/api/documents/uploads/route";
import { GET as meRoute } from "./app/api/me/route";
import { GET as pullRoute } from "./app/api/sync/pull/route";
import { admin, call, signedIn } from "./test-session";

afterAll(() => admin.end());

const pdf = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from(randomUUID())]);
const bodyOf = (bytes: Buffer, subjectId: string, documentId = randomUUID()) =>
  JSON.stringify({
    documentId,
    subjectId,
    title: "Aula",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
  });
const subjectFor = async (cookie: string) => {
  const { userId } = (await (await meRoute(call("/api/me", { cookie }))).json()) as {
    userId: string;
  };
  const id = randomUUID();
  await admin.query(`insert into library.subjects (id, owner_id, name) values ($1, $2, 'Redes')`, [
    id,
    userId,
  ]);
  return id;
};
const start = (cookie: string | undefined, body: string, extra = {}) =>
  startRoute(
    call("/api/documents/uploads", {
      method: "POST",
      body,
      ...(cookie ? { cookie } : {}),
      ...extra,
    }),
  );
const confirm = (cookie: string | undefined, id: string, extra = {}) =>
  confirmRoute(
    call(`/api/documents/${id}/confirm`, {
      method: "POST",
      ...(cookie ? { cookie } : {}),
      ...extra,
    }),
    {
      params: Promise.resolve({ id }),
    },
  );
const open = (cookie: string | undefined, id: string) =>
  fileRoute(call(`/api/documents/${id}/file`, cookie ? { cookie } : {}), {
    params: Promise.resolve({ id }),
  });
const code = async (res: Response) => ((await res.clone().json()) as { code?: string }).code;
const count = async (subjectId: string) =>
  (
    await admin.query(`select count(*)::int as n from library.documents where subject_id = $1`, [
      subjectId,
    ])
  ).rows[0].n as number;

describe("document routes", () => {
  it("[document/upload#AC-10] answers 401 without a session and 403 for a foreign origin, doing nothing", async () => {
    const cookie = await signedIn();
    const subject = await subjectFor(cookie);
    const before = await count(subject);
    const id = randomUUID();

    const noSession = [
      await start(undefined, bodyOf(pdf(), subject)),
      await confirm(undefined, id),
      await open(undefined, id),
    ];
    const foreign = [
      await start(cookie, bodyOf(pdf(), subject), { origin: "https://evil.example" }),
      await confirm(cookie, id, { origin: null }),
    ];

    expect(noSession.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(foreign.map((r) => r.status)).toEqual([403, 403]);
    expect(await code(foreign[0]!)).toBe("FORBIDDEN_ORIGIN");
    expect(await count(subject)).toBe(before);
  });

  it("[document/upload#AC-7] runs start, upload, confirm and shows the stages in a pull", async () => {
    const cookie = await signedIn();
    const subject = await subjectFor(cookie);
    const bytes = pdf();
    const documentId = randomUUID();

    const started = await start(cookie, bodyOf(bytes, subject, documentId));
    const ticket = (await started.json()) as {
      documentId: string;
      upload: { url: string; headers: Record<string, string> };
    };
    const early = await confirm(cookie, documentId);
    const put = await fetch(ticket.upload.url, {
      method: "PUT",
      body: bytes,
      headers: ticket.upload.headers,
    });
    const confirmed = await confirm(cookie, documentId);
    const notReady = await open(cookie, documentId);
    const pulled = (await (await pullRoute(call("/api/sync/pull", { cookie }))).json()) as {
      changes: { entity: string; entityId: string; data?: { status: string } }[];
    };

    expect(started.status).toBe(201);
    expect(ticket.documentId).toBe(documentId);
    expect(early.status).toBe(409);
    expect(await code(early)).toBe("UPLOAD_INCOMPLETE");
    expect(put.status).toBe(200);
    expect(confirmed.status).toBe(202);
    expect(await confirmed.json()).toEqual({ status: "VALIDATING" });
    expect(notReady.status).toBe(409);
    expect(await code(notReady)).toBe("DOCUMENT_NOT_READY");
    expect(pulled.changes.find((c) => c.entityId === documentId)?.data?.status).toBe("VALIDATING");
  });

  it("[document/upload#AC-9] answers 404 to another user, to a non-UUID id and to a malformed start", async () => {
    const owner = await signedIn();
    const intruder = await signedIn();
    const subject = await subjectFor(owner);
    const documentId = randomUUID();
    await start(owner, bodyOf(pdf(), subject, documentId));
    await admin.query(`update library.documents set status = 'READY' where id = $1`, [documentId]);

    const foreign = await open(intruder, documentId);
    const foreignConfirm = await confirm(intruder, documentId);
    const notUuid = await open(owner, "nope");
    const mine = await open(owner, documentId);
    const bad = await start(owner, "{nope");

    expect([foreign.status, foreignConfirm.status, notUuid.status]).toEqual([404, 404, 404]);
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as { url: string }).url).toContain("X-Amz-Signature");
    expect(bad.status).toBe(400);
    expect(await code(bad)).toBe("VALIDATION_FAILED");
  });
});
