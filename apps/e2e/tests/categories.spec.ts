import { expect, test } from "../src/fixtures";
import { pdfBytes, writeFileIn } from "../src/pdfs";

test("[category/screens#AC-7] a category is created with a shortcut, renamed, shown in the reader and deleted", async ({
  signedIn: page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Categorias" }).click();
  await expect(page).toHaveURL(/\/categories$/);
  const list = page.getByRole("list", { name: "Categorias" });
  await expect(list.getByRole("listitem")).toHaveCount(4);

  await page.getByLabel("Nome da nova categoria").fill("Atenção");
  await page.getByLabel("Atalho da nova categoria").selectOption("5");
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(list.getByRole("listitem").last()).toContainText("Atenção");

  await page.getByRole("button", { name: "Editar Atenção" }).click();
  await page.getByLabel("Nome da categoria").fill("Atenção máxima");
  await page.getByLabel("Nome da categoria").press("Enter");
  await expect(list.getByRole("listitem").last()).toContainText("Atenção máxima");

  // the new category is in the reader's palette
  await page.goto("/");
  await page.getByLabel("Nova matéria").fill("Paleta");
  await page.getByLabel("Nova matéria").press("Enter");
  await page.getByRole("link", { name: "Paleta" }).click();
  await page
    .getByLabel("Importar PDFs")
    .setInputFiles(writeFileIn(testInfo.outputPath("files"), "Texto.pdf", pdfBytes.text()));
  await page.getByRole("link", { name: "Texto" }).click();
  await expect(page.getByRole("group", { name: "Categorias" })).toContainText("Atenção máxima");

  // delete it again
  await page.goto("/categories");
  await page.getByRole("button", { name: "Apagar Atenção máxima" }).click();
  await expect(page.getByText("“Atenção máxima” foi para a lixeira.")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(4);
});
