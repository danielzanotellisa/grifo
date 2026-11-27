import { randomBytes } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { mailLinkFor } from "./mail";

export type Account = { email: string; password: string };

export const PASSWORD = "senha-bem-forte-123";
export const newEmail = () => `e2e-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;

/** A client address of its own for each test: the rate limit of the authentication routes counts per address. */
const clientIp = () => {
  const [a, b, c] = randomBytes(3);
  return `10.${a}.${b}.${c}`;
};

const apiHeaders = () => ({
  origin: process.env.APP_URL!,
  "x-real-ip": clientIp(),
  "content-type": "application/json",
});

/** Gives every same-origin API call of the page its own client address (a cross-origin call, like the storage upload, is left alone). */
export async function withOwnClientIp(page: Page): Promise<void> {
  const ip = clientIp();
  await page.route("**/api/**", (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-real-ip": ip } }),
  );
}

/** Signs up and confirms the email through the API, exactly as a person would through the screens. */
export async function createVerifiedAccount(request: APIRequestContext): Promise<Account> {
  const account = { email: newEmail(), password: PASSWORD };
  const headers = apiHeaders();
  const signUp = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Ana E2E", ...account, callbackURL: "/login?verified=1" },
  });
  if (!signUp.ok()) throw new Error(`sign-up answered ${signUp.status()}`);
  const verified = await request.get(await mailLinkFor(account.email), { maxRedirects: 0 });
  if (verified.status() !== 302)
    throw new Error(`the verification link answered ${verified.status()}`);
  return account;
}

/** Signs in through the API; the cookie lands in the context of the page. */
export async function signInThroughApi(page: Page, account: Account): Promise<void> {
  const answer = await page.request.post("/api/auth/sign-in/email", {
    headers: apiHeaders(),
    data: account,
  });
  if (!answer.ok()) throw new Error(`sign-in answered ${answer.status()}`);
}
