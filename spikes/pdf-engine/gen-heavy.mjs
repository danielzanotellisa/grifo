import { launch } from "./browser.mjs";
import fs from "node:fs";
const browser = await launch();
const page = await browser.newPage();
await page.setContent("<canvas id=c width=600 height=800></canvas>");
const imgs = await page.evaluate(async () => {
  const c = document.getElementById("c"); const g = c.getContext("2d"); const out = [];
  for (let i = 0; i < 300; i++) {
    const d = g.createImageData(600, 800);
    let s = i * 7919 + 1;
    for (let p = 0; p < d.data.length; p += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = 90 + ((s >>> 24) % 120); d.data[p] = v; d.data[p + 1] = (v * 3 + i) % 256; d.data[p + 2] = 255 - v; d.data[p + 3] = 255; }
    g.putImageData(d, 0, 0);
    out.push(c.toDataURL("image/jpeg", 0.35));
  }
  return out;
});
console.log("avg jpeg KB", Math.round(imgs.reduce((a, b) => a + b.length, 0) / imgs.length / 1370));
const html = `<style>@page{margin:15mm} section{page-break-after:always} img{width:100%;height:120mm;object-fit:cover} p{font:12pt/1.5 serif}</style>` +
  imgs.map((src, i) => `<section><h2>Figura ${i + 1}</h2><img src="${src}"><p>Legenda da figura ${i + 1}: o método científico exige hipóteses testáveis.</p></section>`).join("");
fs.writeFileSync("fixtures/.heavy.html", `<!doctype html><meta charset=utf-8>${html}`);
const p2 = await browser.newPage();
await p2.goto("file:///private/tmp/heavy.html", { timeout: 240000 });
await p2.pdf({ path: "fixtures/book-300-images.pdf", format: "A4", timeout: 240000 });
console.log("MB", (fs.statSync("fixtures/book-300-images.pdf").size / 1e6).toFixed(1));
await browser.close();
