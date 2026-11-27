import { open, inPage } from "../lib.mjs";
const out = {};
// (a) programmatic ranges and (b) real mouse drag on the two-column page
{
  const { browser, page } = await open("two-column");
  const geo = await inPage(page, async (sel, stage) => {
    sel.selectPage(0); await new Promise((r) => setTimeout(r, 1000));
    const rects = sel.listRects(0).map((r) => ({ ...r })); const text = await sel.readText(); sel.clear();
    return { rects, lines: text.split("\n"), pageH: stage.getPageBox(0).height / stage.getPageBox(0).contentScale };
  });
  const a = geo.rects[2], b = geo.rects[4];
  const vA = await inPage(page, (s, st, k, r) => st.pageRectToViewport(0, r), { x: a.x + 3, y: a.y, width: 1, height: a.height });
  const vB = await inPage(page, (s, st, k, r) => st.pageRectToViewport(0, r), { x: b.x + b.width - 3, y: b.y, width: 1, height: b.height });
  await page.mouse.move(vA.x, vA.y + vA.height / 2);
  await page.mouse.down();
  await page.mouse.move((vA.x + vB.x) / 2, (vA.y + vB.y) / 2, { steps: 6 });
  await page.mouse.move(vB.x, vB.y + vB.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const dragged = await inPage(page, async (sel) => ({ has: sel.hasSelection(), text: await sel.readText(), rects: sel.listRects(0).map((r) => ({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) })), range: sel.getRange() }));
  out.drag = { expectedLines: geo.lines.slice(2, 5), dragged };
  await browser.close();
}
// (c) compound word broken at the end of a line, and a syllabic hyphen
console.log(JSON.stringify(out, null, 1));
