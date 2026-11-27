import { launch } from "../browser.mjs";
import { BASE, decode, darkBox } from "../lib.mjs";
const runs = [];
const PDF = process.argv[2] ?? "book-300";
const colored = (png) => { let n = 0; for (let j = 40; j < 740; j += 4) for (let i = 100; i < 900; i += 4) { const o = (png.width * j + i) * 4; if (Math.abs(png.data[o] - png.data[o + 2]) > 60) n++; } return n > 200; };
for (let n = 0; n < 3; n++) {
  const browser = await launch();
  const ctx = await browser.newContext(); // fresh context: no HTTP cache between runs
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ["longtask"] });
  });
  const t0 = Date.now();
  await page.goto(`${BASE}/?pdf=${PDF}`);
  await page.waitForFunction(() => window.__kernel?.tryCapability?.(window.__tokens.StageToken)?.getPageCount?.() > 0, null, { timeout: 60000 });
  const opened = Date.now() - t0;
  let visible = null;
  while (Date.now() - t0 < 30000) {
    const png = decode(await page.screenshot());
    if (PDF.includes("images") ? colored(png) : darkBox(png, { x: 100, y: 40, width: 800, height: 700 })) { visible = Date.now() - t0; break; }
    await page.waitForTimeout(50);
  }
  const workers = page.workers().length;
  // scroll through ~40 pages with the wheel, as a person would, and record long tasks meanwhile
  await page.evaluate(() => (window.__long.length = 0));
  await page.mouse.move(550, 450);
  for (let i = 0; i < 120; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(16); }
  await page.waitForTimeout(800);
  const long = await page.evaluate(() => window.__long.slice());
  const pageNow = await page.evaluate(() => window.__kernel.tryCapability(window.__tokens.StageToken).getCurrentPageIndex());
  runs.push({ run: n + 1, pdf: PDF, openedMs: opened, firstPageVisibleMs: visible, workers, scrolledToPage: pageNow + 1, longTasks: long.length, longestMs: Math.max(0, ...long), over100: long.filter((d) => d > 100).length });
  await browser.close();
}
console.table(runs);
