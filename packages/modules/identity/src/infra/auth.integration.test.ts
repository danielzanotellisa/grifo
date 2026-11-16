import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { authenticate, createAuth, type AuthMail } from "./auth";

const SECRET = "test-secret-test-secret-test-secret-1234";
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const authPool = new pg.Pool({ connectionString: process.env.DATABASE_AUTH_URL });
const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await Promise.all([admin.end(), authPool.end(), appPool.end()]);
});

const outbox = { verification: [] as AuthMail[], reset: [] as AuthMail[] };
const build = (baseURL: string) =>
  createAuth({
    db: drizzle(authPool),
    secret: SECRET,
    baseURL,
    sendVerificationEmail: async (mail) => void outbox.verification.push(mail),
    sendResetPassword: async (mail) => void outbox.reset.push(mail),
  });
const auth = build("http://localhost:3000");

let counter = 0;
const email = () => `ana${++counter}-${Date.now()}@example.com`;
const PASSWORD = "senha-bem-forte-123";
let ips = 0;
const freshIp = () => `10.3.${(ips >> 8) & 255}.${++ips & 255}`;

const call = (
  instance: typeof auth,
  origin: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  instance.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-real-ip": freshIp(), ...headers },
      body: JSON.stringify(body),
    }),
  );
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(auth, "http://localhost:3000", path, body, headers);
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

const signUp = (address: string, password = PASSWORD) =>
  post("/sign-up/email", { name: "Ana", email: address, password });
const signIn = (address: string, password = PASSWORD, headers: Record<string, string> = {}) =>
  post("/sign-in/email", { email: address, password }, headers);
const verify = async (address: string, instance = auth) => {
  const mail = outbox.verification.filter((m) => m.to === address.trim().toLowerCase()).at(-1)!;
  await instance.handler(new Request(mail.url));
};
const verifiedAccount = async (address = email()) => {
  await signUp(address);
  await verify(address);
  return address;
};
const resolve = (cookie: string) => authenticate(auth, new Headers({ cookie }));
const rows = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

describe("sign up", () => {
  it("[user#AC-3] creates an unverified account with an Argon2id hash, no session and a verification email", async () => {
    const address = email();
    const mixed = address.replace("ana", "ANA");

    const res = await signUp(mixed);

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join(";")).not.toContain("session_token");
    const [user] = await rows(`select * from identity.users where email = $1`, [address]);
    expect(user).toMatchObject({ email_verified: false, display_name: "Ana", deleted_at: null });
    expect(user.id[14]).toBe("7");
    const [account] = await rows(`select password from identity.accounts where user_id = $1`, [
      user.id,
    ]);
    expect(account.password.startsWith("$argon2id$")).toBe(true);
    expect(outbox.verification.some((m) => m.to === address)).toBe(true);
    expect(
      await rows(`select 1 from identity.sessions where user_id = $1`, [user.id]),
    ).toHaveLength(0);
  });

  it("[user#AC-3] refuses a password shorter than 10 or longer than 128 characters and creates nothing", async () => {
    for (const password of ["curta-1", "x".repeat(129)]) {
      const address = email();
      expect((await signUp(address, password)).status).toBe(400);
      expect(await rows(`select 1 from identity.users where email = $1`, [address])).toHaveLength(
        0,
      );
    }
    expect((await signUp(email(), "x".repeat(128))).status).toBe(200);
  });

  it("[user#AC-4] answers an existing email like a new one and creates no second account", async () => {
    const address = email();
    const first = await signUp(address);
    const again = await signUp(address.toUpperCase());
    const other = await signUp(email());

    expect(again.status).toBe(first.status);
    expect(again.status).toBe(other.status);
    expect(Object.keys(await again.json()).sort()).toEqual(Object.keys(await first.json()).sort());
    expect(
      await rows(`select 1 from identity.users where lower(email) = $1`, [address]),
    ).toHaveLength(1);
  });
});

describe("sign in", () => {
  it("[user#AC-5] is refused until the email is verified, then gives a session with safe cookies", async () => {
    const address = email();
    await signUp(address);

    const refused = await signIn(address);
    expect(refused.status).toBe(403);
    expect(refused.headers.getSetCookie().join(";")).not.toContain("session_token");

    await verify(address);
    const res = await signIn(address);

    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().join(" | ");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });

  it("[user#AC-5] marks the cookie Secure when the base URL is https", async () => {
    const origin = "https://app.example.com";
    const secure = build(origin);
    const address = email();
    await call(secure, origin, "/sign-up/email", {
      name: "Ana",
      email: address,
      password: PASSWORD,
    });
    await verify(address, secure);

    const res = await call(secure, origin, "/sign-in/email", {
      email: address,
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join(" | ")).toMatch(/;\s*Secure/i);
  });

  it("[user#AC-6] answers a wrong password and an unknown email the same way", async () => {
    const address = await verifiedAccount();

    const wrong = await signIn(address, "senha-errada-123");
    const unknown = await signIn(email(), PASSWORD);

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await unknown.text()).toBe(await wrong.text());
  });
});

describe("password reset", () => {
  const request = (address: string) =>
    post("/request-password-reset", { email: address, redirectTo: "http://localhost:3000/reset" });

  it("[user#AC-2] answers identically for a known and an unknown email, and mails only the known one", async () => {
    const known = await verifiedAccount();
    const unknown = email();

    const [a, b] = [await request(known), await request(unknown)];

    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
    expect(outbox.reset.some((m) => m.to === known)).toBe(true);
    expect(outbox.reset.some((m) => m.to === unknown)).toBe(false);
  });

  it("[user#AC-7] sets the new password, drops the old one and ends every open session", async () => {
    const address = await verifiedAccount();
    const open = cookieOf(await signIn(address));
    expect(await resolve(open)).not.toBeNull();
    await request(address);
    const { token } = outbox.reset.filter((m) => m.to === address).at(-1)!;

    const res = await post("/reset-password", { newPassword: "outra-senha-forte-456", token });

    expect(res.status).toBe(200);
    expect(await resolve(open)).toBeNull();
    expect((await signIn(address, PASSWORD)).status).toBe(401);
    expect((await signIn(address, "outra-senha-forte-456")).status).toBe(200);
  });
});

describe("sessions", () => {
  it("[user#AC-8] resolves a cookie to its user, and sign-out ends it", async () => {
    const address = await verifiedAccount();
    const cookie = cookieOf(await signIn(address));
    const [user] = await rows(`select id from identity.users where email = $1`, [address]);

    expect(await resolve(cookie)).toEqual({ userId: user.id, email: address });
    expect(await authenticate(auth, new Headers())).toBeNull();

    await post("/sign-out", {}, { cookie });
    expect(await resolve(cookie)).toBeNull();
  });

  it("[user#AC-8] ends the other sessions and keeps the current one", async () => {
    const address = await verifiedAccount();
    const [one, two] = [cookieOf(await signIn(address)), cookieOf(await signIn(address))];

    await post("/revoke-other-sessions", {}, { cookie: one });

    expect(await resolve(one)).not.toBeNull();
    expect(await resolve(two)).toBeNull();
  });
});

describe("protection", () => {
  it("[user#AC-9] limits sign-in attempts per IP in the database and ignores a spoofed X-Forwarded-For", async () => {
    const address = await verifiedAccount();
    const attempts = async (headers: (i: number) => Record<string, string>) => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++)
        statuses.push((await signIn(address, "errada-errada-1", headers(i))).status);
      return statuses;
    };

    const same = await attempts(() => ({ "x-real-ip": "10.9.0.1" }));
    const spoofed = await attempts((i) => ({
      "x-real-ip": "10.9.0.2",
      "x-forwarded-for": `9.9.9.${i}`,
    }));

    expect(same.slice(0, 3)).toEqual([401, 401, 401]);
    expect(same.slice(3)).toEqual([429, 429, 429]);
    expect(spoofed).toContain(429);
    expect(
      (await rows(`select count(*)::int as n from identity.rate_limits`))[0].n,
    ).toBeGreaterThan(0);
  });

  it("[user#AC-10] refuses a request from another origin, and a cookie request with no Origin", async () => {
    const address = await verifiedAccount();
    const cookie = cookieOf(await signIn(address));

    const foreignSignIn = await signIn(address, PASSWORD, { origin: "https://evil.example" });
    const foreignSignOut = await post("/sign-out", {}, { cookie, origin: "https://evil.example" });
    const noOrigin = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json", cookie, "x-real-ip": freshIp() },
        body: "{}",
      }),
    );

    expect([foreignSignIn.status, foreignSignOut.status, noOrigin.status]).toEqual([403, 403, 403]);
    expect(await resolve(cookie)).not.toBeNull();
  });

  it("[user#AC-11] keeps credentials and sessions out of reach of the application role", async () => {
    for (const table of ["users", "sessions", "accounts", "verifications", "rate_limits"]) {
      await expect(appPool.query(`select * from identity.${table}`)).rejects.toThrow(
        /permission denied/i,
      );
    }
  });

  it("refuses a secret shorter than 32 characters", () => {
    expect(() =>
      createAuth({
        db: drizzle(authPool),
        secret: "short",
        baseURL: "http://localhost:3000",
        sendVerificationEmail: async () => {},
        sendResetPassword: async () => {},
      }),
    ).toThrow(/32/);
  });
});

describe("email delivery", () => {
  it("[user/email#AC-2] does not make the response wait for a slow email sink", async () => {
    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 700));
    const slowAuth = createAuth({
      db: drizzle(authPool),
      secret: SECRET,
      baseURL: "http://localhost:3000",
      sendVerificationEmail: slow,
      sendResetPassword: slow,
    });
    const address = email();

    const started = performance.now();
    const res = await call(slowAuth, "http://localhost:3000", "/sign-up/email", {
      name: "Ana",
      email: address,
      password: PASSWORD,
    });
    const elapsed = performance.now() - started;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });
});
