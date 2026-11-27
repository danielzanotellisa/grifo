import { open, inPage } from "../lib.mjs";
const { browser, page } = await open("two-column");
await page.evaluate(() => {
  window.__ctx = [];
  document.addEventListener("contextmenu", (e) => { window.__ctx.push({ x: Math.round(e.clientX), y: Math.round(e.clientY), prevented: e.defaultPrevented, target: e.target.tagName }); e.preventDefault(); }, true);
});
// select two lines with a real drag
const g = await inPage(page, async (sel, stage) => { sel.selectPage(0); await new Promise((r) => setTimeout(r, 900)); const r = sel.listRects(0).map((x) => ({ ...x })); sel.clear(); return r; });
const a = g[2], b = g[3];
const vA = await inPage(page, (s, st, k, r) => st.pageRectToViewport(0, r), { x: a.x + 3, y: a.y, width: 1, height: a.height });
const vB = await inPage(page, (s, st, k, r) => st.pageRectToViewport(0, r), { x: b.x + b.width - 3, y: b.y, width: 1, height: b.height });
await page.mouse.move(vA.x, vA.y + vA.height / 2); await page.mouse.down();
await page.mouse.move(vB.x, vB.y + vB.height / 2, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(500);
const before = await inPage(page, (sel) => sel.hasSelection());
// right-click over the selection (first selected line)
await page.mouse.click(vA.x + 60, vA.y + vA.height / 2, { button: "right" });
await page.waitForTimeout(300);
const afterRight = await inPage(page, async (sel) => ({ has: sel.hasSelection(), text: (await sel.readText()).length }));
// our own highlight overlay on a stored rect, right-click on it
const ov = await inPage(page, (sel, stage, k, rect) => stage.pageRectToViewport(0, rect), g[8]);
await page.evaluate((v) => {
  const d = document.createElement("div"); d.id = "hl"; d.dataset.highlight = "h1";
  Object.assign(d.style, { position: "fixed", left: v.x + "px", top: v.y + "px", width: v.width + "px", height: v.height + "px", background: "rgba(255,200,0,.4)", zIndex: 5 });
  d.addEventListener("contextmenu", (e) => { window.__hlMenu = { id: d.dataset.highlight, prevented: true }; e.preventDefault(); e.stopPropagation(); });
  document.body.appendChild(d);
}, ov);
await page.mouse.click(ov.x + 20, ov.y + ov.height / 2, { button: "right" });
await page.waitForTimeout(300);
console.log(JSON.stringify({ selectedBefore: before, afterRightClick: afterRight, contextEvents: await page.evaluate(() => window.__ctx), highlightMenu: await page.evaluate(() => window.__hlMenu) }, null, 1));
await browser.close();
