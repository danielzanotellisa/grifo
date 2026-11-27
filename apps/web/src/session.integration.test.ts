import { afterAll, describe, expect, it } from "vitest";
import { currentUser } from "./lib/session";
import { admin, signedIn } from "./test-session";

afterAll(() => admin.end());

describe("current user of a request", () => {
  it("[user/screens#AC-7] is the person of a valid session and nobody without one", async () => {
    const cookie = await signedIn();

    const user = await currentUser(new Headers({ cookie }));
    const none = await currentUser(new Headers());
    const forged = await currentUser(new Headers({ cookie: "better-auth.session_token=nope" }));

    expect(user?.email).toMatch(/@example\.com$/);
    expect(none).toBeNull();
    expect(forged).toBeNull();
  });
});
