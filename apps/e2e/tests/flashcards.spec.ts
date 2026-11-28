import { readFileSync } from "node:fs";
import { expect, test } from "../src/fixtures";
import { pdfBytes, writeFileIn } from "../src/pdfs";

test("[flashcard/screens#AC-9] [export/apkg#AC-9] a Definição passage becomes a flashcard that is edited, updated from the summary, exported to Anki and deleted", async ({
  signedIn: page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Nova matéria").fill("Cartões");
  await page.getByLabel("Nova matéria").press("Enter");
  await page.getByRole("link", { name: "Cartões" }).click();
  await expect(page).toHaveURL(/\/subjects\//);
  await page
    .getByLabel("Importar PDFs")
    .setInputFiles(writeFileIn(testInfo.outputPath("files"), "Texto.pdf", pdfBytes.text()));
  await page.getByRole("link", { name: "Texto" }).click();
  await expect(page.getByText("Página 1 de 1")).toBeVisible();

  // mark the first line with the key 2 (Definição)
  const sheet = page.locator('div[tabindex="0"] img[draggable="false"]');
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  const scale = box.width / 400;
  const y = box.y + 62 * scale;
  await page.mouse.move(box.x + 42 * scale, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 150 * scale, y, { steps: 8 });
  await page.mouse.move(box.x + 280 * scale, y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("menu", { name: "Marcar seleção" })).toBeVisible();
  await page.keyboard.press("2");
  await expect(
    page.getByRole("complementary", { name: "Marcações" }).getByRole("listitem"),
  ).toHaveCount(1);

  // the summary offers the card; the card is created
  await page.getByRole("link", { name: "Resumo" }).click();
  const node = page.getByRole("tree").getByRole("treeitem");
  await expect(node).toHaveCount(1);
  await node.getByRole("button", { name: "Criar flashcard" }).click();
  await page.getByLabel("Frente do flashcard").fill("  O que é a primeira linha?  ");
  await page.getByLabel("Frente do flashcard").press("Enter");
  await expect(node.getByRole("link", { name: "1 flashcard" })).toBeVisible();

  // the cards page shows it with the passage as the back
  await page.getByRole("link", { name: "Flashcards", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/.+\/flashcards$/);
  const cards = page.getByRole("list", { name: "Flashcards" }).getByRole("listitem");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("O que é a primeira linha?");
  await expect(cards.first()).toContainText("Primeira linha");

  // edit the front
  await cards
    .first()
    .getByRole("button", { name: /^Editar/ })
    .click();
  await page.getByLabel("Frente do flashcard").fill("Primeira linha?");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(cards.first()).toContainText("Primeira linha?");
  await page.reload();
  await expect(cards.first()).toContainText("Primeira linha?");

  // change the node text on the summary, then update the card from it
  await page.getByRole("link", { name: "Ir para o resumo" }).click();
  await node.click();
  await page.keyboard.press("Enter");
  await page.getByLabel("Texto do nó").fill("Texto novo do resumo");
  await page.getByLabel("Texto do nó").press("Enter");
  await expect(node).toContainText("Texto novo do resumo");
  await page.getByRole("link", { name: "Flashcards", exact: true }).click();
  await expect(cards.first()).not.toContainText("Texto novo do resumo");
  await cards
    .first()
    .getByRole("button", { name: /^Atualizar pelo resumo/ })
    .click();
  await expect(cards.first()).toContainText("Texto novo do resumo");

  // export the deck: the browser downloads an .apkg (a zip)
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar para Anki" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Texto.apkg");
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.byteLength).toBeGreaterThan(1000);

  // delete
  await cards
    .first()
    .getByRole("button", { name: /^Apagar/ })
    .click();
  await expect(page.getByText("foi para a lixeira.")).toBeVisible();
  await expect(cards).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/ainda não tem flashcards/)).toBeVisible();
});
