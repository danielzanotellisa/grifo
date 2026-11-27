import { randomUUID } from "node:crypto";
import { expect, test } from "../src/fixtures";
import { pdfBytes, writeFileIn } from "../src/pdfs";

test("[e2e] reads documents: pages, zoom, keys, a long book and a hostile PDF", async ({
  signedIn: page,
}, testInfo) => {
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const dir = testInfo.outputPath("files");
  await page.goto("/");
  await page.getByLabel("Nova matéria").fill("Leitura");
  await page.getByLabel("Nova matéria").press("Enter");
  await page.getByRole("link", { name: "Leitura" }).click();
  await expect(page).toHaveURL(/\/subjects\//);
  await page
    .getByLabel("Importar PDFs")
    .setInputFiles([
      writeFileIn(dir, "Artigo.pdf", pdfBytes.plain(2)),
      writeFileIn(dir, "Livro.pdf", pdfBytes.plain(300)),
      writeFileIn(dir, "hostil.pdf", pdfBytes.hostile()),
      writeFileIn(dir, "protegido.pdf", pdfBytes.encrypted()),
    ]);
  await expect(page.locator("li", { hasText: /Enviando…|Validando…/ })).toHaveCount(0);
  const subjectUrl = page.url();
  const pageLabel = page.getByText(/Página \d+ de \d+/);
  const zoom = page.locator('[role="toolbar"] span.tabular-nums');

  // only a ready document opens
  await expect(page.locator("li [data-title] a")).toHaveText(["Artigo", "hostil", "Livro"]);
  await expect(page.locator("li [data-title]", { hasText: "protegido" }).locator("a")).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Artigo" }).click();
  await expect(page).toHaveURL(/\/documents\//);
  await expect(pageLabel).toHaveText("Página 1 de 2");
  await expect(zoom).toHaveText("100%");
  await expect(page.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(pageLabel).toHaveText("Página 2 de 2");
  await expect(page.getByRole("button", { name: "Próxima página" })).toBeDisabled();

  await page.getByRole("button", { name: "Aumentar zoom" }).click();
  await expect(zoom).toHaveText("125%");
  await page.getByRole("button", { name: "Diminuir zoom" }).click();
  await page.getByRole("button", { name: "Diminuir zoom" }).click();
  await expect(zoom).toHaveText("75%");
  await page.getByRole("button", { name: "Ajustar à largura" }).click();
  await expect(zoom).not.toHaveText("75%");
  const fitted = await zoom.textContent();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("+");
  await expect(zoom).not.toHaveText(fitted!);
  await page.keyboard.press("0");
  await expect(zoom).toHaveText(fitted!);

  const goTo = page.getByLabel("Ir para a página");
  const labelBefore = await pageLabel.textContent();
  await goTo.fill("9");
  await goTo.press("Enter");
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)').first()).toHaveText(
    "Digite uma página de 1 a 2.",
  );
  await expect(pageLabel).toHaveText(labelBefore!);
  await goTo.fill("1");
  await goTo.press("Enter");
  await expect(pageLabel).toHaveText("Página 1 de 2");

  await page.getByRole("link", { name: "Voltar à matéria" }).click();
  await expect(page).toHaveURL(subjectUrl);

  // a long book
  await page.getByRole("link", { name: "Livro" }).click();
  await expect(pageLabel).toHaveText("Página 1 de 300");
  await goTo.fill("150");
  await goTo.press("Enter");
  await expect(pageLabel).toHaveText("Página 150 de 300");
  await goTo.press("Escape");
  await page.locator('div[tabindex="0"]').first().focus();
  await page.keyboard.press("End");
  await expect(pageLabel).toHaveText("Página 300 de 300");
  await page.keyboard.press("Home");
  await expect(pageLabel).toHaveText("Página 1 de 300");
  for (let i = 0; i < 6; i++) await page.keyboard.press("PageDown");
  await expect(pageLabel).not.toHaveText("Página 1 de 300");

  // a PDF whose JavaScript must not run
  await page.goto(subjectUrl);
  await page.getByRole("link", { name: "hostil" }).click();
  await expect(pageLabel).toHaveText("Página 1 de 1");
  await page.waitForTimeout(1500);
  expect(dialogs).toEqual([]);

  // a document that is not there
  await page.goto("/documents/00000000-0000-7000-8000-000000000000");
  await expect(page.getByText("Documento não encontrado.")).toBeVisible();
});

test("[e2e] a document that is still being prepared does not open", async ({ signedIn: page }) => {
  await page.goto("/");
  await page.getByLabel("Nova matéria").fill("Preparo");
  await page.getByLabel("Nova matéria").press("Enter");
  await page.getByRole("link", { name: "Preparo" }).click();
  await expect(page).toHaveURL(/\/subjects\//);
  const subjectUrl = page.url();
  const subjectId = subjectUrl.split("/").pop()!;

  // start an upload and never confirm it: the document stays UPLOADED
  const documentId = randomUUID();
  const started = await page.request.post("/api/documents/uploads", {
    headers: { origin: process.env.APP_URL! },
    data: {
      documentId,
      subjectId,
      title: "Sem confirmar",
      sha256: "a".repeat(64),
      sizeBytes: 100,
    },
  });
  expect(started.status()).toBe(201);

  await page.goto(`/documents/${documentId}`);
  await expect(page.getByText("Este documento ainda está sendo preparado.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar à matéria" })).toHaveAttribute(
    "href",
    `/subjects/${subjectId}`,
  );
});
