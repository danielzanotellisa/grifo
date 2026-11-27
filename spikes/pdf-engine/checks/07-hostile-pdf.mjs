import { open, inPage } from "../lib.mjs";
const { browser, page, log } = await open("hostile");
await page.waitForTimeout(3000);
const r = await inPage(page, async (sel, stage) => {
  sel.selectPage(0); await new Promise((r) => setTimeout(r, 800));
  return { pages: stage.getPageCount(), text: await sel.readText() };
});
const urls = [];
const info = {
  rendered: r,
  dialogs: log.dialogs,
  alertsCaptured: await page.evaluate(() => window.__alerts),
  pageErrors: log.errors,
  workers: page.workers().map((w) => w.url().slice(0, 80)),
  mainThreadPdfiumGlobals: await page.evaluate(() => Object.keys(window).filter((k) => /pdfium|acrojs|quickjs/i.test(k))),
};
console.log(JSON.stringify(info, null, 1));
await browser.close();
