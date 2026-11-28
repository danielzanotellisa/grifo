import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { POST as requestRoute } from "./app/api/exports/route";
import { GET as statusRoute } from "./app/api/exports/[id]/route";
import { GET as meRoute } from "./app/api/me/route";
import { admin, call, signedIn } from "./test-session";

afterAll(() => admin.end());

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
const ask = (cookie: string | undefined, body: unknown, extra = {}) =>
  requestRoute(
    call("/api/exports", {
      method: "POST",
      body: JSON.stringify(body),
      ...(cookie ? { cookie } : {}),
      ...extra,
    }),
  );
const status = (cookie: string | undefined, id: string) =>
  statusRoute(call(`/api/exports/${id}`, cookie ? { cookie } : {}), {
    params: Promise.resolve({ id }),
  });
const deck = (scopeId: string) => ({ kind: "FLASHCARDS_APKG", scope: "SUBJECT", scopeId });
const code = async (res: Response) => ((await res.clone().json()) as { code?: string }).code;

describe("export routes", () => {
  it("[export/apkg#AC-5] answers 202 with an id, 401 without a session, 403 for a foreign origin", async () => {
    const cookie = await signedIn();
    const subject = await subjectFor(cookie);

    const accepted = await ask(cookie, deck(subject));
    const noSession = await ask(undefined, deck(subject));
    const foreign = await ask(cookie, deck(subject), { origin: "https://evil.example" });

    expect(accepted.status).toBe(202);
    expect(((await accepted.json()) as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(noSession.status).toBe(401);
    expect(foreign.status).toBe(403);
  });

  it("[export/apkg#AC-5] answers 404 for a scope that is missing or another user's, and 400 for a bad request", async () => {
    const cookie = await signedIn();
    const stranger = await signedIn();
    const subject = await subjectFor(stranger);

    const foreign = await ask(cookie, deck(subject));
    const missing = await ask(cookie, deck(randomUUID()));
    const badKind = await ask(cookie, { ...deck(subject), kind: "SUMMARY_PDF" });
    const badScope = await ask(cookie, { kind: "FLASHCARDS_APKG", scope: "SUBJECT" });
    const notJson = await requestRoute(
      call("/api/exports", { method: "POST", body: "nope", cookie }),
    );

    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect([badKind.status, badScope.status, notJson.status]).toEqual([400, 400, 400]);
    expect(await code(badKind)).toBe("VALIDATION_FAILED");
  });

  it("[export/apkg#AC-6] answers the status of an export, 401 without a session and 404 to another user", async () => {
    const cookie = await signedIn();
    const stranger = await signedIn();
    const subject = await subjectFor(cookie);
    const { id } = (await (await ask(cookie, deck(subject))).json()) as { id: string };

    const own = await status(cookie, id);
    const noSession = await status(undefined, id);
    const foreign = await status(stranger, id);
    const notUuid = await status(cookie, "nao-e-uuid");

    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ id, status: "QUEUED", error: null });
    expect(noSession.status).toBe(401);
    expect([foreign.status, notUuid.status]).toEqual([404, 404]);
  });
});
