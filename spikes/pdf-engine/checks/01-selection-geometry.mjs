import { open, inPage } from "../lib.mjs";
const results = {};
for (const pdf of ["two-column", "hyphenated", "formulas", "book-300", "scanned"]) {
  const { browser, page } = await open(pdf);
  const r = await inPage(page, async (sel, stage) => {
    const ref = stage.getPageBox(0).ref;
    const box = stage.getPageBox(0);
    sel.selectAll?.();
    await new Promise((r) => setTimeout(r, 1200));
    sel.clear();
    sel.selectPage(0);
    await new Promise((r) => setTimeout(r, 1200));
    const text = await sel.readText();
    const segs = sel.listSegments(0);
    const rects = sel.listRects(0);
    return { pageW: box.width / box.contentScale, pageH: box.height / box.contentScale, textLen: text.length, head: text.slice(0, 160), lines: text.split("\n").length, segs: segs.length, first: rects[0], last: rects.at(-1) };
  });
  results[pdf] = r;
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
