import { execFileSync } from "node:child_process";
import { createVerifiedAccount } from "../src/account";
import { EXTERNAL_URL } from "../src/env";
import { expect, test } from "../src/fixtures";

test("[_cross-cutting/local-run#AC-1] the stack is up: migrated, healthy, serving the app and mailing through the worker", async ({
  page,
  request,
}) => {
  // Only when the tests run against a compose stack: its one-shot migration ended successfully.
  if (EXTERNAL_URL) {
    const migrate = JSON.parse(
      execFileSync("docker", ["compose", "ps", "-a", "--format", "json", "migrate"], {
        encoding: "utf8",
      })
        .trim()
        .split("\n")[0]!,
    ) as { State: string; ExitCode: number };
    expect(migrate).toMatchObject({ State: "exited", ExitCode: 0 });
  }

  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

  // a sign-up mail only exists if the web app, the queue, the worker and the mail server all work
  const account = await createVerifiedAccount(request);
  expect(account.email).toMatch(/@example\.com$/);
});
