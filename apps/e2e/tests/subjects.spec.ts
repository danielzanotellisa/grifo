import { expect, test } from "../src/fixtures";

test("[e2e] creates, renames and deletes subjects, then restores one from the trash", async ({
  signedIn: page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/Você ainda não tem matérias/)).toBeVisible();
  const names = page.locator("li [data-name]");

  await page.getByLabel("Nova matéria").fill("   ");
  await page.getByLabel("Nova matéria").press("Enter");
  await expect(page.locator('p[role="alert"]')).toHaveText("Informe o nome da matéria.");
  for (const name of ["Redes de Computadores", "Álgebra Linear", "Zoologia"]) {
    await page.getByLabel("Nova matéria").fill(name);
    await page.getByLabel("Nova matéria").press("Enter");
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(names).toHaveText(["Álgebra Linear", "Redes de Computadores", "Zoologia"]);

  await page.getByLabel("Nova matéria").fill("x".repeat(121));
  await page.getByLabel("Nova matéria").press("Enter");
  await expect(page.locator('p[role="alert"]')).toHaveText("O nome pode ter até 120 caracteres.");
  await page.getByLabel("Nova matéria").fill("");

  await page.getByRole("button", { name: "Renomear Zoologia" }).click();
  const field = page.getByLabel("Novo nome de Zoologia");
  await expect(field).toHaveValue("Zoologia");
  await field.fill("Biologia");
  await field.press("Escape");
  await expect(names).toHaveText(["Álgebra Linear", "Redes de Computadores", "Zoologia"]);
  await page.getByRole("button", { name: "Renomear Zoologia" }).click();
  await page.getByLabel("Novo nome de Zoologia").fill("  Biologia  ");
  await page.getByLabel("Novo nome de Zoologia").press("Enter");
  await expect(names).toHaveText(["Álgebra Linear", "Biologia", "Redes de Computadores"]);

  await page.getByRole("button", { name: "Apagar Redes de Computadores" }).click();
  await expect(page.getByRole("status")).toContainText(
    "“Redes de Computadores” foi para a lixeira.",
  );
  await expect(names).toHaveText(["Álgebra Linear", "Biologia"]);

  await page.getByRole("link", { name: "Lixeira" }).click();
  await expect(page).toHaveURL(/\/trash$/);
  const item = page.locator("li").first();
  await expect(item).toContainText("Redes de Computadores");
  await expect(item).toContainText("Matéria");
  await page.getByRole("button", { name: "Restaurar Redes de Computadores" }).click();
  await expect(page.getByText("A lixeira está vazia.")).toBeVisible();

  await page.goto("/");
  await expect(names).toHaveText(["Álgebra Linear", "Biologia", "Redes de Computadores"]);
});

test("[_cross-cutting/undo#AC-1] a deleted subject comes back with Desfazer, with the button and with Ctrl+Z", async ({
  signedIn: page,
}) => {
  await page.goto("/");
  for (const name of ["Álgebra", "Biologia"]) {
    await page.getByLabel("Nova matéria").fill(name);
    await page.getByLabel("Nova matéria").press("Enter");
    await expect(page.getByRole("link", { name })).toBeVisible();
  }

  await page.getByRole("button", { name: "Apagar Álgebra" }).click();
  await expect(page.getByRole("link", { name: "Álgebra" })).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("link", { name: "Álgebra" })).toBeVisible();

  await page.getByRole("button", { name: "Apagar Biologia" }).click();
  await expect(page.getByRole("link", { name: "Biologia" })).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("link", { name: "Biologia" })).toBeVisible();
});
