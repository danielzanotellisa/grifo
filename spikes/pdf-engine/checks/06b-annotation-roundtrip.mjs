// reopen the annotated file in the engine and read the annotation back (PDFium round trip)
import { open, inPage } from "../lib.mjs";
import fs from "node:fs";
fs.copyFileSync("out/annotated.pdf", "fixtures/annotated.pdf");
const { browser, page } = await open("annotated");
const r = await inPage(page, async (sel, stage, k) => {
  const ann = k.tryCapability(window.__tokens.AnnotationToken);
  await new Promise((r) => setTimeout(r, 1000));
  const list = ann.list();
  return list.map((a) => ({ kind: a.kind, page: a.page?.kind }));
});
console.log("PDFium reads back:", JSON.stringify(r));
await page.screenshot({ path: "out/shot-annotated.png" });
await browser.close();
