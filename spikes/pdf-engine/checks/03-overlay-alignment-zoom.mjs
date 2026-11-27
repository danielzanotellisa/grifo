import { open, inPage, decode, darkBox } from "../lib.mjs";

const pdf = process.argv[2] ?? "two-column";
const { browser, page } = await open(pdf, { viewport: { width: 1100, height: 800 } });
// two lines to test: one in column 1 (index 5 of segments) and, when present, one in the right column
const { rects } = await inPage(page, async (sel, stage) => {
  sel.selectPage(0);
  await new Promise((r) => setTimeout(r, 1200));
  const rects = sel.listRects(0).map((r) => ({ ...r }));
  sel.clear();
  return { rects };
});
const targets = [rects[6], rects.find((r) => r.x > 250) ?? rects[20]];
const out = [];
for (const zoom of [0.5, 1, 2, 4]) {
  await inPage(page, async (sel, stage, k, z) => { stage.zoomTo(z); }, zoom);
  await page.waitForTimeout(1500);
  for (const rect of targets) {
    // bring the line to the middle of the viewport
    for (let i = 0; i < 3; i++) {
      const v = await inPage(page, (sel, stage, k, r) => ({ v: stage.pageRectToViewport(0, r), size: stage.getViewportSize() }), rect);
      await inPage(page, (sel, stage, k, a) => stage.panBy(-a.dx, -a.dy), { dx: v.v.x + v.v.width / 2 - v.size.width / 2, dy: v.v.y + v.v.height / 2 - v.size.height / 2 });
      await page.waitForTimeout(1200);
    }
    const v = await inPage(page, (sel, stage, k, r) => stage.pageRectToViewport(0, r), rect);
    const png = decode(await page.screenshot());
    const pad = 0;
    const box = darkBox(png, { x: v.x - 5, y: v.y - pad, width: v.width + 10, height: v.height + 2 * pad });
    out.push({ zoom, rectPx: { x: +v.x.toFixed(1), y: +v.y.toFixed(1), w: +v.width.toFixed(1), h: +v.height.toFixed(1) }, ink: box, dLeft: box && +(box.left - v.x).toFixed(1), dRight: box && +(box.right - (v.x + v.width)).toFixed(1), dTop: box && +(box.top - v.y).toFixed(1), dBottom: box && +(box.bottom - (v.y + v.height)).toFixed(1) });
  }
}
console.table(out.map(({ zoom, rectPx, dLeft, dRight, dTop, dBottom }) => ({ zoom, ...rectPx, dLeft, dRight, dTop, dBottom })));
await browser.close();
