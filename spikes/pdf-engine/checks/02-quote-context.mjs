import { open, inPage } from "../lib.mjs";
const { browser, page } = await open("two-column");
const r = await inPage(page, async (sel, stage) => {
  const ref = stage.getPageBox(0).ref;
  const pos = (index) => ({ page: ref, index });
  const read = (s, e) => sel.readTextInRange({ start: pos(s), end: pos(e) });
  const whole = await read(0, 100000);
  // a selection in the middle of a paragraph, crossing a line break
  sel.select({ page: ref, start: 130, count: 70 });
  await new Promise((r) => setTimeout(r, 700));
  const exact = await sel.readText();
  const range = sel.getRange();
  const s = range.start.index, e = range.end.index;
  const prefix = await read(Math.max(0, s - 32), s);
  const suffix = await read(e, e + 32);
  const first = await read(0, 5);
  const atStart = await read(Math.max(0, 3 - 32), 3);
  const wide = await read(Math.max(0, s - 32), e + 32);
  return { s, e, exact, prefix, prefix_len: prefix.length, suffix, suffix_len: suffix.length, joined_equals_wide: prefix + exact + suffix === wide, atStart, wholeLen: whole.length };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
