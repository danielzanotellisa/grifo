import { launch } from "../browser.mjs";
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
const errs = [], failed = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
p.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) failed.push(r.status() + " " + r.url()); });
await p.goto("http://localhost:5198/?pdf=two-column");
await p.waitForFunction(() => window.__kernel?.tryCapability?.(window.__tokens.StageToken)?.getPageCount?.() > 0, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);
const r = await p.evaluate(async () => {
  const k = window.__kernel; if (!k) return { kernel: false };
  const sel = k.tryCapability(window.__tokens.SelectionToken), stage = k.tryCapability(window.__tokens.StageToken);
  sel.selectPage(0); await new Promise((r) => setTimeout(r, 900));
  return { kernel: true, pages: stage.getPageCount(), text: (await sel.readText()).slice(0, 60), segments: sel.listSegments(0).length };
});
console.log(JSON.stringify({ r, errs, failed, workers: p.workers().map((w) => w.url().split("/").slice(-2).join("/")) }, null, 1));
await p.screenshot({ path: "out/shot-next.png" });
await b.close();
