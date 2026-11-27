import { afterAll, describe, expect, it } from "vitest";
import { GET as verifyRoute, POST as authPost } from "./app/api/auth/[...all]/route";
import { admin, call, mailUrl } from "./test-session";

afterAll(() => admin.end());

describe("the verification link of the sign-up screen", () => {
  it("[user/screens#AC-8] verifies the email and redirects to the sign-in screen", async () => {
    const address = `screens${Date.now()}@example.com`;
    const password = "senha-bem-forte-123";
    await authPost(
      call("/api/auth/sign-up/email", {
        method: "POST",
        body: JSON.stringify({
          name: "Ana",
          email: address,
          password,
          callbackURL: "/login?verified=1",
        }),
      }),
    );

    const answer = await verifyRoute(new Request(await mailUrl(address), { redirect: "manual" }));

    expect(answer.status).toBe(302);
    expect(
      new URL(answer.headers.get("location")!, "http://localhost:3000").pathname +
        new URL(answer.headers.get("location")!, "http://localhost:3000").search,
    ).toBe("/login?verified=1");
    const [row] = (
      await admin.query(`select email_verified from identity.users where email = $1`, [address])
    ).rows;
    expect(row.email_verified).toBe(true);
    const signedIn = await authPost(
      call("/api/auth/sign-in/email", {
        method: "POST",
        body: JSON.stringify({ email: address, password }),
      }),
    );
    expect(signedIn.status).toBe(200);
  });
});
