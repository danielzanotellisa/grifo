import { expect, test } from "../src/fixtures";
import { pdfBytes, writeFileIn } from "../src/pdfs";

test("[highlight/screens#AC-9] marks text with the mouse, draws and lists it, keeps it after a reload and removes it", async ({
  signedIn: page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Nova matéria").fill("Marcar");
  await page.getByLabel("Nova matéria").press("Enter");
  await page.getByRole("link", { name: "Marcar" }).click();
  await expect(page).toHaveURL(/\/subjects\//);
  await page
    .getByLabel("Importar PDFs")
    .setInputFiles(writeFileIn(testInfo.outputPath("files"), "Texto.pdf", pdfBytes.text()));
  await page.getByRole("link", { name: "Texto" }).click();
  await expect(page.getByText("Página 1 de 1")).toBeVisible();

  const categories = page.getByRole("group", { name: "Categorias" });
  await expect(categories.getByRole("button")).toHaveText([
    "Tópico1",
    "Definição2",
    "Exemplo3",
    "Importante4",
  ]);
  const sheet = page.locator('div[tabindex="0"] img[draggable="false"]');
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  const scale = box.width / 400; // a 400 by 300 point page
  const line1 = box.y + 62 * scale; // the middle of the first line of text
  const line2 = box.y + 102 * scale;

  // drag from the start of the first line to the middle of the second
  await page.mouse.move(box.x + 42 * scale, line1);
  await page.mouse.down();
  await page.mouse.move(box.x + 120 * scale, line2, { steps: 12 });
  await page.mouse.move(box.x + 200 * scale, line2, { steps: 6 });
  await page.mouse.up();

  const menu = page.getByRole("menu", { name: "Marcar seleção" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("2"); // Definição

  const panel = page.getByRole("complementary", { name: "Marcações" });
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(panel.getByRole("listitem")).toContainText("Primeira linha do trecho");
  await expect(panel.getByRole("listitem")).toContainText("Página 1");
  await expect(menu).toBeHidden();

  // drawn over the text, in the color of the category, where the first line is
  const drawn = page.locator("[data-highlight]");
  await expect(drawn.first()).toBeVisible();
  const rects = await drawn.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        color: getComputedStyle(el).backgroundColor,
      };
    }),
  );
  expect(rects.length).toBeGreaterThanOrEqual(2);
  const covers = (point: { x: number; y: number }) =>
    rects.some(
      (r) =>
        point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height,
    );
  expect(covers({ x: box.x + 60 * scale, y: line1 })).toBe(true);
  expect(covers({ x: box.x + 60 * scale, y: line2 })).toBe(true);
  expect(covers({ x: box.x + 60 * scale, y: box.y + 250 * scale })).toBe(false);
  expect(rects[0]!.color).toBe("rgb(247, 208, 79)");

  // it survives a reload
  await page.reload();
  await expect(page.getByText("Página 1 de 1")).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("[data-highlight]").first()).toBeVisible();

  // change its category from the panel, then delete it
  await panel.getByRole("combobox").selectOption({ label: "Exemplo" });
  await expect
    .poll(async () =>
      page
        .locator("[data-highlight]")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe("rgb(91, 193, 127)");
  await panel.getByRole("button", { name: /^Apagar marcação/ }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(0);
  await expect(page.locator("[data-highlight]")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Marcação enviada para a lixeira.");

  await page.reload();
  await expect(page.getByText("Página 1 de 1")).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(0);
  await page.goto("/trash");
  await expect(page.locator("li").first()).toContainText("Marcação");
});
