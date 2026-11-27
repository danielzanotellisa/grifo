import { open, inPage } from "../lib.mjs";
const { browser, page } = await open("compound");
const r = await inPage(page, async (sel, stage, k) => {
  const ref = stage.getPageBox(0).ref;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const search = k.tryCapability(window.__tokens.SearchToken);
  const pos = (i) => ({ page: ref, index: i });
  sel.selectPage(0); await wait(900);
  const chars = [];
  for (let i = 60; i < 110; i++) chars.push(JSON.stringify(await sel.readTextInRange({ start: pos(i), end: pos(i + 1) })));
  sel.clear();
  const hits = {};
  for (const q of ["bem-estar", "bemestar", "bem estar", "orientado", "orien tado", "sócio-econômica", "sócioeconômica", "guarda-chuva", "guardachuva"]) {
    const res = await search.findAll({ text: q });
    hits[q] = res.map((h) => ({ start: h.start, count: h.count, lines: h.segments.length }));
  }
  return { chars: chars.join(" "), hits };
});
console.log(r.chars);
console.log(JSON.stringify(r.hits));
await browser.close();
