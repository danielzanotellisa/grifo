import { localEngine } from "@embedpdf/engine";
import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const t0 = Date.now();
const engine = localEngine();
const original = fs.readFileSync("fixtures/two-column.pdf");
const doc = await engine.open({ kind: "bytes", bytes: new Uint8Array(original) });
const { matches } = await doc.search.query({ text: "tcp garante" });
console.log("matches", matches.length);
for (const match of matches) {
  await doc.page(match.page).annotations.create({ subtype: "highlight", quadPoints: match.segments.map((s) => s.quad) });
}
const bytes = await doc.download();
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/node-annotated.pdf", bytes);
console.log("node ok in", Date.now() - t0, "ms; original", original.length, "-> exported", bytes.length, "; original prefix preserved:", Buffer.compare(Buffer.from(bytes).subarray(0, original.length), original) === 0);
const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const anns = (await (await pdf.getPage(1)).getAnnotations()).map((a) => a.subtype);
console.log("pdfjs sees annotations on page 1:", anns);
await doc.close?.();
process.exit(0);
