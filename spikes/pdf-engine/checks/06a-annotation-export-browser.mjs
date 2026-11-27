import { open, inPage } from "../lib.mjs";
import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const { browser, page, log } = await open("two-column");
const r = await inPage(page, async (sel, stage, k) => {
  const ann = k.tryCapability(window.__tokens.AnnotationToken);
  const ref = stage.getPageBox(0).ref;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const result = { tools: ann.tools?.list?.().map((t) => t.id ?? t.name).slice(0, 20) };
  sel.select({ page: ref, start: 86, count: 130 }); await wait(800);
  try {
    const out = await ann.createFromSelection("highlight");
    result.created = out.annotations.map((a) => ({ kind: a.kind ?? a.type ?? a.subtype, keys: Object.keys(a).slice(0, 12) }));
  } catch (e) { result.createError = String(e).slice(0, 300); }
  await wait(500);
  const docId = k.documents.getActiveId();
  const bytes = await k.documents.download(docId);
  result.bytes = bytes.length;
  result.b64 = btoa(String.fromCharCode(...bytes.subarray(0, 0))) ; // avoid huge arg spread
  let bin = ""; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  result.data = btoa(bin);
  return result;
});
const bytes = Buffer.from(r.data, "base64");
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/annotated.pdf", bytes);
delete r.data; delete r.b64;
console.log(JSON.stringify(r, null, 1));
const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const p1 = await doc.getPage(1);
const anns = await p1.getAnnotations();
console.log("pdfjs (Firefox engine) sees:", anns.map((a) => ({ subtype: a.subtype, rect: a.rect?.map((n) => +n.toFixed(1)), quadPoints: a.quadPoints?.length, color: a.color && Array.from(a.color), contents: a.contentsObj?.str })));
console.log("original bytes", fs.statSync("fixtures/two-column.pdf").size, "annotated", bytes.length, "header", bytes.subarray(0, 8).toString());
await browser.close();
