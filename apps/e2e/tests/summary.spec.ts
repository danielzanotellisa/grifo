import { readFileSync } from "node:fs";
import { expect, test } from "../src/fixtures";
import { pdfBytes, writeFileIn } from "../src/pdfs";

test("[outline-node/screens#AC-11] [export/summary-pdf#AC-7] two marked passages become nodes that Tab indents, and free text can be added, edited and removed", async ({
  signedIn: page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Nova matéria").fill("Resumir");
  await page.getByLabel("Nova matéria").press("Enter");
  await page.getByRole("link", { name: "Resumir" }).click();
  await expect(page).toHaveURL(/\/subjects\//);
  await page
    .getByLabel("Importar PDFs")
    .setInputFiles(writeFileIn(testInfo.outputPath("files"), "Texto.pdf", pdfBytes.text()));
  await page.getByRole("link", { name: "Texto" }).click();
  await expect(page.getByText("Página 1 de 1")).toBeVisible();

  // mark the first line and then the second, each with the key 1 (Tópico)
  const sheet = page.locator('div[tabindex="0"] img[draggable="false"]');
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  const scale = box.width / 400;
  const panel = page.getByRole("complementary", { name: "Marcações" });
  for (const [count, line] of [
    [1, 62],
    [2, 102],
  ] as const) {
    const y = box.y + line * scale;
    await page.mouse.move(box.x + 42 * scale, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 150 * scale, y, { steps: 8 });
    await page.mouse.move(box.x + 280 * scale, y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole("menu", { name: "Marcar seleção" })).toBeVisible();
    await page.keyboard.press("1");
    await expect(panel.getByRole("listitem")).toHaveCount(count);
  }

  await page.getByRole("link", { name: "Resumo" }).click();
  await expect(page).toHaveURL(/\/documents\/.+\/summary$/);
  const tree = page.getByRole("tree");
  const items = tree.getByRole("treeitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Primeira linha");
  await expect(items.nth(1)).toContainText("Segunda linha");
  await expect(items.nth(0)).toHaveAttribute("aria-level", "1");
  await expect(items.nth(1)).toHaveAttribute("aria-level", "1");

  // Tab indents the second under the first; it is still there after a reload
  await items.nth(1).click();
  await page.keyboard.press("Tab");
  await expect(items.nth(1)).toHaveAttribute("aria-level", "2");
  await expect(items.nth(1).getByRole("heading")).toHaveAttribute("aria-level", "2");
  await page.reload();
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toHaveAttribute("aria-level", "2");

  // Shift+Tab brings it back
  await items.nth(1).click();
  await page.keyboard.press("Shift+Tab");
  await expect(items.nth(1)).toHaveAttribute("aria-level", "1");

  // free text: add, edit, remove
  await page.getByLabel("Papel do novo nó").selectOption("DEFINITION");
  await page.getByLabel("Texto do novo nó").fill("  Nota minha  ");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(items).toHaveCount(3);
  const note = items.filter({ hasText: "Nota minha" });
  await expect(note).toContainText("Definição");

  await note.click();
  await page.keyboard.press("Enter");
  await page.getByLabel("Texto do nó").fill("Nota editada");
  await page.getByLabel("Texto do nó").press("Enter");
  await expect(items.filter({ hasText: "Nota editada" })).toHaveCount(1);

  // export the summary: the browser downloads a PDF
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar resumo (PDF)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Texto.pdf");
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  await items.filter({ hasText: "Nota editada" }).click();
  await page.keyboard.press("Delete");
  await expect(items).toHaveCount(2);
  await page.reload();
  await expect(items).toHaveCount(2);
});
