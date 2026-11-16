import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { deleteAccount } from "./account";
import { authenticate, createAuth, type AuthMail } from "./auth";

const SECRET = "test-secret-test-secret-test-secret-1234";
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
const authPool = new pg.Pool({ connectionString: process.env.DATABASE_AUTH_URL });
const db = drizzle(authPool);

afterAll(async () => {
  await Promise.all([admin.end(), authPool.end()]);
});

const outbox: AuthMail[] = [];
const signedIn: string[] = [];
let failSeed = false;
const auth = createAuth({
  db,
  secret: SECRET,
  baseURL: "http://localhost:3000",
  sendVerificationEmail: async (mail) => void outbox.push(mail),
  sendResetPassword: async () => {},
  onSignIn: async (userId) => {
    signedIn.push(userId);
    if (failSeed) throw new Error("seed failed");
  },
});

let counter = 0;
const email = () => `bia${++counter}-${Date.now()}@example.com`;
const PASSWORD = "senha-bem-forte-123";
let ips = 0;
const freshIp = () => `10.4.${(ips >> 8) & 255}.${++ips & 255}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-real-ip": freshIp(),
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
const signIn = (address: string, password = PASSWORD) =>
  post("/sign-in/email", { email: address, password });
const account = async () => {
  const address = email();
  await post("/sign-up/email", { name: "Bia", email: address, password: PASSWORD });
  await auth.handler(new Request(outbox.filter((m) => m.to === address).at(-1)!.url));
  return address;
};
const rows = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const headersOf = (cookie: string) => new Headers({ cookie });

describe("deleting an account", () => {
  it("[user/lifecycle#AC-1] soft-deletes, removes every session and closes the account for good", async () => {
    const address = await account();
    const [one, two] = [cookieOf(await signIn(address)), cookieOf(await signIn(address))];
    const [user] = await rows(`select id from identity.users where email = $1`, [address]);

    await deleteAccount({ db, auth, headers: headersOf(one), password: PASSWORD });

    expect(
      (await rows(`select deleted_at from identity.users where id = $1`, [user.id]))[0].deleted_at,
    ).not.toBeNull();
    expect(
      await rows(`select 1 from identity.sessions where user_id = $1`, [user.id]),
    ).toHaveLength(0);
    expect(await authenticate(auth, headersOf(one))).toBeNull();
    expect(await authenticate(auth, headersOf(two))).toBeNull();
    expect((await signIn(address)).status).toBe(401);

    const again = await post("/sign-up/email", { name: "Bia", email: address, password: PASSWORD });
    expect(again.status).toBe(200);
    expect(
      await rows(`select 1 from identity.users where lower(email) = $1`, [address]),
    ).toHaveLength(1);
    expect(
      await rows(`select 1 from identity.sessions where user_id = $1`, [user.id]),
    ).toHaveLength(0);
  });

  it("[user/lifecycle#AC-3] refuses a wrong password and changes nothing", async () => {
    const address = await account();
    const cookie = cookieOf(await signIn(address));
    const [user] = await rows(`select id from identity.users where email = $1`, [address]);

    await expect(
      deleteAccount({ db, auth, headers: headersOf(cookie), password: "senha-errada-123" }),
    ).rejects.toThrow(expect.objectContaining({ code: "INVALID_CREDENTIALS", status: 401 }));

    expect(
      (await rows(`select deleted_at from identity.users where id = $1`, [user.id]))[0].deleted_at,
    ).toBeNull();
    expect(await authenticate(auth, headersOf(cookie))).not.toBeNull();
  });

  it("[user/lifecycle#AC-3] refuses a request with no session", async () => {
    await expect(
      deleteAccount({ db, auth, headers: new Headers(), password: PASSWORD }),
    ).rejects.toThrow(expect.objectContaining({ code: "UNAUTHENTICATED", status: 401 }));
  });
});

describe("the session", () => {
  it("[user/access#AC-3] resolves to the id and the email of the user", async () => {
    const address = await account();
    const cookie = cookieOf(await signIn(address));
    const [user] = await rows(`select id from identity.users where email = $1`, [address]);

    expect(await authenticate(auth, headersOf(cookie))).toEqual({
      userId: user.id,
      email: address,
    });
  });

  it("[user/access#AC-4] stops resolving once the account is deleted, even if the session row survives", async () => {
    const address = await account();
    const cookie = cookieOf(await signIn(address));
    await admin.query(`update identity.users set deleted_at = now() where email = $1`, [address]);

    expect(
      await rows(
        `select 1 from identity.sessions s join identity.users u on u.id = s.user_id where u.email = $1`,
        [address],
      ),
    ).toHaveLength(1);
    expect(await authenticate(auth, headersOf(cookie))).toBeNull();
  });
});

describe("the sign-in hook", () => {
  it("[user/lifecycle#AC-2] tells the app who signed in, every time", async () => {
    const address = await account();
    const [user] = await rows(`select id from identity.users where email = $1`, [address]);
    signedIn.length = 0;

    await signIn(address);
    await signIn(address);

    expect(signedIn).toEqual([user.id, user.id]);
  });

  it("[user/lifecycle#AC-2] never blocks the sign-in when the app's hook fails", async () => {
    const address = await account();
    failSeed = true;
    try {
      expect((await signIn(address)).status).toBe(200);
    } finally {
      failSeed = false;
    }
  });
});
