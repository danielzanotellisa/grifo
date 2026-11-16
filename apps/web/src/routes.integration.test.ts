import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { GET as accountGet } from "./app/api/auth/[...all]/route";
import { POST as authPost } from "./app/api/auth/[...all]/route";
import { POST as deleteRoute } from "./app/api/account/delete/route";
import { GET as meRoute } from "./app/api/me/route";
import { outbox } from "./mailer";

const ORIGIN = "http://localhost:3000";
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });

afterAll(() => admin.end());

let counter = 0;
const email = () => `caio${++counter}-${Date.now()}@example.com`;
const PASSWORD = "senha-bem-forte-123";
let ips = 0;
const freshIp = () => `10.5.${(ips >> 8) & 255}.${++ips & 255}`;

const request = (
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-real-ip": freshIp(),
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
const authCall = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  authPost(request(`/api/auth${path}`, { body, headers }));
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
const problem = async (res: Response) => ({
  status: res.status,
  type: res.headers.get("content-type"),
  code: ((await res.clone().json()) as { code?: string }).code,
});

const signUp = (address: string, password = PASSWORD) =>
  authCall("/sign-up/email", { name: "Caio", email: address, password });
const signIn = (address: string, password = PASSWORD, headers: Record<string, string> = {}) =>
  authCall("/sign-in/email", { email: address, password }, headers);
const verifiedAccount = async () => {
  const address = email();
  await signUp(address);
  await accountGet(new Request(outbox.filter((m) => m.to === address).at(-1)!.url));
  return address;
};
const signedIn = async () => {
  const address = await verifiedAccount();
  return { address, cookie: cookieOf(await signIn(address)) };
};
const me = (cookie?: string) =>
  meRoute(request("/api/me", { method: "GET", headers: cookie ? { cookie } : {} }));
const remove = (cookie: string | undefined, body: unknown, headers: Record<string, string> = {}) =>
  deleteRoute(
    request("/api/account/delete", {
      body,
      headers: { ...(cookie ? { cookie } : {}), ...headers },
    }),
  );
const rows = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

describe("authentication errors", () => {
  it("[user#AC-12] answers Problem Details with the stable code", async () => {
    const unverified = email();
    await signUp(unverified);
    const known = await verifiedAccount();

    expect(await problem(await signIn(known, "senha-errada-123"))).toEqual({
      status: 401,
      type: "application/problem+json",
      code: "INVALID_CREDENTIALS",
    });
    expect(await problem(await signIn(email()))).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(await problem(await signIn(unverified))).toMatchObject({
      status: 403,
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(await problem(await signUp(email(), "curta-1"))).toMatchObject({
      status: 400,
      code: "PASSWORD_INVALID",
    });
    expect(await problem(await signUp(email(), "x".repeat(129)))).toMatchObject({
      status: 400,
      code: "PASSWORD_INVALID",
    });
    expect(
      await problem(
        await authCall("/reset-password", {
          newPassword: "outra-senha-forte-456",
          token: "inválido",
        }),
      ),
    ).toMatchObject({
      status: 400,
      code: "INVALID_TOKEN",
    });
    expect(
      await problem(await signIn(known, PASSWORD, { origin: "https://evil.example" })),
    ).toMatchObject({
      status: 403,
      code: "FORBIDDEN_ORIGIN",
    });
  });

  it("[user#AC-12] answers 429 RATE_LIMITED and keeps Retry-After", async () => {
    const address = await verifiedAccount();
    const responses: Response[] = [];
    for (let i = 0; i < 6; i++)
      responses.push(await signIn(address, "errada-errada-1", { "x-real-ip": "10.6.0.1" }));

    const limited = responses.at(-1)!;

    expect(await problem(limited)).toEqual({
      status: 429,
      type: "application/problem+json",
      code: "RATE_LIMITED",
    });
    expect(
      limited.headers.get("retry-after") ?? limited.headers.get("x-retry-after"),
    ).not.toBeNull();
  });

  it("does not turn a successful answer into an error", async () => {
    const address = await verifiedAccount();

    const res = await signIn(address);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).not.toContain("problem");
  });
});

describe("the guard and /api/me", () => {
  it("[user/access#AC-2] answers 401 UNAUTHENTICATED with no valid session", async () => {
    expect(await problem(await me())).toEqual({
      status: 401,
      type: "application/problem+json",
      code: "UNAUTHENTICATED",
    });
    expect(await problem(await me("better-auth.session_token=falso.falso"))).toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(await problem(await remove(undefined, { password: PASSWORD }))).toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  it("[user/access#AC-3] answers the id and the email of the session", async () => {
    const { address, cookie } = await signedIn();
    const [user] = await rows(`select id from identity.users where email = $1`, [address]);

    const res = await me(cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: user.id, email: address });
  });
});

describe("deleting the account", () => {
  it("[user/lifecycle#AC-1][user/access#AC-4] deletes, clears the cookie and closes the session for good", async () => {
    const { address, cookie } = await signedIn();
    const [user] = await rows(`select id from identity.users where email = $1`, [address]);

    const res = await remove(cookie, { password: PASSWORD });

    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join(" | ")).toMatch(/session_token=;|Max-Age=0/i);
    expect(
      (await rows(`select deleted_at from identity.users where id = $1`, [user.id]))[0].deleted_at,
    ).not.toBeNull();
    expect(
      await rows(`select 1 from identity.sessions where user_id = $1`, [user.id]),
    ).toHaveLength(0);
    expect(await problem(await me(cookie))).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect((await signIn(address)).status).toBe(401);
  });

  it("[user/lifecycle#AC-3] refuses a wrong or missing password and changes nothing", async () => {
    const { address, cookie } = await signedIn();

    expect(await problem(await remove(cookie, { password: "senha-errada-123" }))).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(await problem(await remove(cookie, {}))).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(await problem(await remove(cookie, "não é objeto"))).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });

    expect(
      (await rows(`select deleted_at from identity.users where email = $1`, [address]))[0]
        .deleted_at,
    ).toBeNull();
    expect((await me(cookie)).status).toBe(200);
  });

  it("[user/lifecycle#AC-3][user/access#AC-5] refuses a foreign or missing origin and changes nothing", async () => {
    const { address, cookie } = await signedIn();
    const noOrigin = new Request(`${ORIGIN}/api/account/delete`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-real-ip": freshIp() },
      body: JSON.stringify({ password: PASSWORD }),
    });

    expect(
      await problem(
        await remove(cookie, { password: PASSWORD }, { origin: "https://evil.example" }),
      ),
    ).toMatchObject({
      status: 403,
      code: "FORBIDDEN_ORIGIN",
    });
    expect(await problem(await deleteRoute(noOrigin))).toMatchObject({
      status: 403,
      code: "FORBIDDEN_ORIGIN",
    });

    expect(
      (await rows(`select deleted_at from identity.users where email = $1`, [address]))[0]
        .deleted_at,
    ).toBeNull();
    expect((await me(cookie)).status).toBe(200);
  });
});

describe("the first sign-in", () => {
  it("[user/lifecycle#AC-2] seeds the default categories once", async () => {
    const address = await verifiedAccount();
    const [user] = await rows(`select id from identity.users where email = $1`, [address]);
    expect(
      await rows(`select 1 from annotation.categories where owner_id = $1`, [user.id]),
    ).toHaveLength(0);

    await signIn(address);
    await signIn(address);

    const categories = await rows(
      `select name, role, shortcut from annotation.categories where owner_id = $1 order by position`,
      [user.id],
    );
    expect(categories).toEqual([
      { name: "Tópico", role: "TOPIC", shortcut: 1 },
      { name: "Definição", role: "DEFINITION", shortcut: 2 },
      { name: "Exemplo", role: "ITEM", shortcut: 3 },
      { name: "Importante", role: "ITEM", shortcut: 4 },
    ]);
  });
});
