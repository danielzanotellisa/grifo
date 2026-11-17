import pg from "pg";
import { GET as verifyRoute, POST as authPost } from "./app/api/auth/[...all]/route";

export const ORIGIN = "http://localhost:3000";
const PASSWORD = "senha-bem-forte-123";
export const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATOR_URL });
let counter = 0;
let ips = 0;
export const call = (
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
export const signedIn = async (): Promise<string> => {
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
