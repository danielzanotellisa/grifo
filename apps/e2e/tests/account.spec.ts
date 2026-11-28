import { expect, test } from "../src/fixtures";
import { PASSWORD } from "../src/account";
import { mailLinkFor } from "../src/mail";

const NEW_PASSWORD = "outra-senha-forte-456";

test("[user/account-screens#AC-7] a forgotten password is reset through the e-mail link and the new one signs in", async ({
  page,
  account,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toContainText(`Se existir uma conta com ${account.email}`);

  await page.goto(await mailLinkFor(account.email, 30_000, "Redefinição de senha"));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("Nova senha").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await expect(page.getByRole("status")).toContainText("Senha alterada.");

  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("E-mail ou senha incorretos.");

  await page.getByLabel("Senha").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(`Você entrou como ${account.email}.`)).toBeVisible();

  // a used or broken link is explained
  await page.goto("/reset-password?token=quebrado");
  await page.getByLabel("Nova senha").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Este link é inválido ou expirou.");
});

test("[user/account-screens#AC-7] the account is deleted with its password and cannot sign in again", async ({
  signedIn: page,
  account,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Conta" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("main").getByText(account.email)).toBeVisible();

  await page.getByLabel("Senha atual").fill("senha-errada-123");
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("Senha incorreta.");

  await page.getByLabel("Senha atual").fill(PASSWORD);
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("E-mail ou senha incorretos.");
});

test("[user/account-screens#AC-4] a sign-in before the confirmation offers to send the e-mail again", async ({
  page,
}) => {
  const email = `e2e-resend-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Nome").fill("Ana");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: "Reenviar e-mail de confirmação" }).click();
  await expect(page.getByRole("status")).toContainText(`Enviamos um novo link para ${email}.`);

  await page.goto(await mailLinkFor(email, 30_000, "Confirme seu e-mail"));
  await expect(page).toHaveURL(/\/login\?verified=1$/);
});
