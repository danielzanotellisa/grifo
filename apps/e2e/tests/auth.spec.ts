import { expect, test } from "../src/fixtures";
import { newEmail, PASSWORD } from "../src/account";
import { mailLinkFor } from "../src/mail";

const formAlert = (page: import("@playwright/test").Page) => page.locator('p[role="alert"]');

test("[e2e] sign-up, email confirmation, sign-in, reload and sign-out", async ({ page }) => {
  const email = newEmail();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/signup");
  await page.getByLabel("Nome").fill("Ana");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("curta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(formAlert(page)).toHaveText("A senha precisa ter de 10 a 128 caracteres.");

  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(formAlert(page)).toContainText("Confirme seu e-mail antes de entrar.");

  await page.goto(await mailLinkFor(email));
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await expect(page.getByRole("status")).toContainText("E-mail confirmado.");

  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(formAlert(page)).toHaveText("E-mail ou senha incorretos.");

  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(`Você entrou como ${email}.`)).toBeVisible();

  await page.reload();
  await expect(page.getByText(`Você entrou como ${email}.`)).toBeVisible();
  const cookie = (await page.context().cookies()).find((c) => c.name.includes("session_token"));
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/trash");
  await expect(page).toHaveURL(/\/login$/);
});
