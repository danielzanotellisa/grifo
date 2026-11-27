import { expect, test } from "../src/fixtures";
import { pdfBytes, writeFileIn, writeHugeFileIn } from "../src/pdfs";

test("[e2e] imports PDFs, follows their validation and manages the documents", async ({
  signedIn: page,
}, testInfo) => {
  const dir = testInfo.outputPath("files");
  await page.goto("/");
  await page.getByLabel("Nova matéria").fill("Redes");
  await page.getByLabel("Nova matéria").press("Enter");
  await page.getByRole("link", { name: "Redes" }).click();
  await expect(page.getByText(/Esta matéria ainda não tem documentos/)).toBeVisible();
  const row = (title: string) =>
    page.locator("li", { has: page.locator("[data-title]", { hasText: title }) });

  await page
    .getByLabel("Importar PDFs")
    .setInputFiles([
      writeFileIn(dir, "Aula 1.pdf", pdfBytes.plain(2)),
      writeFileIn(dir, "falso.pdf", Buffer.from("isto não é um pdf, só tem o nome")),
      writeFileIn(dir, "protegido.pdf", pdfBytes.encrypted()),
      writeFileIn(dir, "hostil.pdf", pdfBytes.hostile()),
      writeHugeFileIn(dir, "enorme.pdf"),
    ]);

  await expect(row("Aula 1")).toContainText("Pronto");
  await expect(row("Aula 1")).toContainText("2 páginas");
  await expect(row("falso")).toContainText("Não é um PDF válido.");
  await expect(row("protegido")).toContainText("PDF protegido por senha não é aceito.");
  await expect(row("hostil")).toContainText("Pronto");
  await expect(page.locator('div[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    "“enorme.pdf” passa de 100 MiB.",
  );
  await expect(page.locator("li [data-title]")).toHaveText([
    "Aula 1",
    "falso",
    "hostil",
    "protegido",
  ]);

  // the same bytes again: a second document, and the server keeps one copy
  await page
    .getByLabel("Importar PDFs")
    .setInputFiles(writeFileIn(dir, "Aula 1.pdf", pdfBytes.plain(2)));
  await expect(page.locator("li [data-title]", { hasText: "Aula 1" })).toHaveCount(2);
  await expect(page.locator("li", { hasText: /Enviando…|Validando…/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Renomear falso" }).click();
  await page.getByLabel("Novo título de falso").fill("  Rascunho  ");
  await page.getByLabel("Novo título de falso").press("Enter");
  await expect(row("Rascunho")).toBeVisible();

  await page.getByRole("button", { name: "Apagar Rascunho" }).click();
  await expect(page.getByRole("status")).toHaveText("“Rascunho” foi para a lixeira.");
  await page.getByRole("link", { name: "Lixeira" }).click();
  await expect(page.locator("li").first()).toContainText("Rascunho");
  await page.getByRole("button", { name: "Restaurar Rascunho" }).click();
  await expect(page.getByText("A lixeira está vazia.")).toBeVisible();

  await page.goto("/");
  await expect(page.locator("li", { hasText: "Redes" })).toContainText("5 documentos");
  await page.goto("/subjects/00000000-0000-7000-8000-000000000000");
  await expect(page.getByText("Matéria não encontrada.")).toBeVisible();
});
