import { open, inPage } from "../lib.mjs";
const results = {};
for (const pdf of ["two-column", "hyphenated", "formulas", "compound"]) {
  const { browser, page } = await open(pdf);
  results[pdf] = await inPage(page, async (sel, stage, k) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const search = k.tryCapability(window.__tokens.SearchToken);
    const ref = stage.getPageBox(0).ref;
    const pos = (i) => ({ page: ref, index: i });
    const read = (s, e) => sel.readTextInRange({ start: pos(Math.max(0, s)), end: pos(e) });
    // normalize like the server will: soft hyphens out, newlines to a space, spaces collapsed
    const norm = (t) => t.normalize("NFKC").replace(/­/g, "").replace(/\s*\n\s*/g, " ").replace(/[ \t ]+/g, " ").trim();
    const commonTail = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; };
    const commonHead = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };

    // the re-anchoring algorithm under test: the quote and the page decide; the stored rects only break ties
    async function reanchor(pageIndex, quote, hint) {
      const hits = (await search.findAll({ text: quote.exact })).filter((h) => h.pageIndex === pageIndex);
      if (hits.length === 0) return null;
      const scored = [];
      for (const h of hits) {
        const before = norm(await read(h.start - 32, h.start));
        const after = norm(await read(h.start + h.count, h.start + h.count + 32));
        const r0 = h.segments[0].rect;
        const dist = hint ? Math.hypot(r0.x - hint.x, r0.y - hint.y) : 0;
        scored.push({ h, score: commonTail(before, quote.prefix) + commonHead(after, quote.suffix), dist });
      }
      scored.sort((x, y) => y.score - x.score || x.dist - y.dist);
      const top = scored[0];
      const contextTied = scored.filter((x) => x.score === top.score).length > 1;
      return { start: top.h.start, count: top.h.count, rects: top.h.segments.map((s) => s.rect), candidates: hits.length, contextTied };
    }

    const text = await read(0, 100000);
    const total = [...text].length;
    sel.selectPage(0); await wait(800); const original = sel.listRects(0).length; sel.clear();
    let seed = 12345; const rnd = (n) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
    const stats = { trials: 0, startsMatch: 0, rectsMatch: 0, uniqueMatches: 0, resolvedByContext: 0, resolvedByRectHintOnly: 0, wrongPick: 0, notFound: 0, wrongPickWhenContextTied: 0 };
    const failures = [];
    for (let t = 0; t < 60; t++) {
      const count = 18 + rnd(100); const raw0 = rnd(Math.max(1, total - count - 40));
      const rawText = await read(raw0, raw0 + count);
      const lead = rawText.length - rawText.trimStart().length, tail = rawText.length - rawText.trimEnd().length;
      const start = raw0 + lead, n = count - lead - tail; // the selection a person means: no stray blanks at the ends
      if (n < 12) continue;
      sel.select({ page: ref, start, count: n }); await wait(120);
      const exact = norm(await sel.readText());
      const truth = sel.listSegments(0).map((s) => s.rect);
      const quote = { exact, prefix: norm(await read(start - 32, start)), suffix: norm(await read(start + n, start + n + 32)) };
      sel.clear();
      stats.trials++;
      const hint = { x: truth[0].x + 25, y: truth[0].y + 25 }; // the stored rects, deliberately corrupted
      const found = await reanchor(0, quote, hint);
      if (!found) { stats.notFound++; failures.push({ start, n, exact: exact.slice(0, 40), why: "not found" }); continue; }
      const startOk = found.start === start && found.count === n;
      const rectsOk = found.rects.length === truth.length && found.rects.every((r, i) => Math.abs(r.x - truth[i].x) < 0.5 && Math.abs(r.y - truth[i].y) < 0.5 && Math.abs(r.width - truth[i].width) < 0.5);
      if (startOk) stats.startsMatch++;
      if (rectsOk) stats.rectsMatch++;
      if (found.candidates === 1 && startOk) stats.uniqueMatches++;
      if (found.candidates > 1 && !found.contextTied && startOk) stats.resolvedByContext++;
      if (found.candidates > 1 && found.contextTied && startOk) stats.resolvedByRectHintOnly++;
      if (!startOk) { stats.wrongPick++; if (found.contextTied) stats.wrongPickWhenContextTied++; failures.push({ start, n, exact: exact.slice(0, 50), foundStart: found.start, foundCount: found.count, candidates: found.candidates, contextTied: found.contextTied }); }
    }
    return { totalChars: total, ...stats, failures: failures.slice(0, 4) };
  });
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
