import { launch } from "./browser.mjs";
import fs from "node:fs";

const PARA = [
  "O método científico exige que as hipóteses sejam testadas de forma sistemática, com observações reproduzíveis e critérios claros de refutação. Quando um resultado contraria a teoria, o pesquisador deve revisar os pressupostos antes de descartar os dados coletados.",
  "A aprendizagem significativa ocorre quando o novo conteúdo se relaciona de maneira não arbitrária com o que o estudante já sabe. Por isso, resumos estruturados e cartões de revisão espaçada ajudam a consolidar conceitos de longo prazo e a evitar a memorização mecânica.",
  "Em redes de computadores, o protocolo TCP garante a entrega ordenada e confiável dos segmentos, utilizando confirmações, retransmissões e controle de congestionamento. Já o UDP prioriza a baixa latência e dispensa qualquer garantia de entrega.",
  "A Constituição estabelece que todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros e aos estrangeiros residentes no País a inviolabilidade do direito à vida, à liberdade, à igualdade, à segurança e à propriedade.",
];
const text = (n) => Array.from({ length: n }, (_, i) => `<p>${PARA[i % PARA.length]}</p>`).join("");
const css = `body{font:12pt/1.5 "Times New Roman",serif;margin:0} p{margin:0 0 10pt}`;

const docs = {
  "two-column": `<style>${css} .c{column-count:2;column-gap:24pt}</style><div class="c">${text(14)}</div>`,
  hyphenated: `<style>${css} .n{width:150pt;hyphens:manual;text-align:justify}</style><div class="n"><p>A aprendizagem exige um trabalho orien&shy;tado e a análise do desenvol&shy;vimento do estu&shy;dante em situações concre&shy;tas de ensino.</p><p>Segundo o texto, o bem-estar dos alunos depende do ambiente escolar acolhedor e do apoio constante da família ao longo do ano.</p></div>`,
  formulas: `<style>${css}</style><p>A energia é dada por E = mc² e a área do círculo por A = πr². A soma ∑ xᵢ para i = 1…n converge se |x| &lt; 1, e a integral ∫ f(x) dx vale F(b) − F(a).</p><p>Sendo α ≥ β ≥ γ, então √(α² + β²) ≤ α + β.</p>${text(2)}`,
  "book-300": `<style>${css} section{page-break-after:always}</style>${Array.from({ length: 300 }, (_, i) => `<section><h2>Capítulo ${i + 1}</h2>${text(6)}</section>`).join("")}`,
};

const browser = await launch();
const ctx = await browser.newContext();
for (const [name, html] of Object.entries(docs)) {
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><meta charset=utf-8><html lang="pt-BR">${html}</html>`);
  await page.pdf({ path: `fixtures/${name}.pdf`, format: "A4", margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } });
  await page.close();
  console.log(name, fs.statSync(`fixtures/${name}.pdf`).size);
}
// scanned: render a text page to a PNG and wrap it in an image-only PDF
const shot = await ctx.newPage();
await shot.setViewportSize({ width: 794, height: 1123 });
await shot.setContent(`<!doctype html><meta charset=utf-8><style>${css} body{padding:60px}</style>${text(5)}`);
const png = (await shot.screenshot()).toString("base64");
const img = await ctx.newPage();
await img.setContent(`<style>@page{margin:0}body{margin:0}img{width:210mm;height:297mm;display:block}</style><img src="data:image/png;base64,${png}">`);
await img.pdf({ path: "fixtures/scanned.pdf", width: "210mm", height: "297mm" });
console.log("scanned", fs.statSync("fixtures/scanned.pdf").size);
// hostile: OpenAction + JavaScript, with a visible line of text
const objs = [
  "<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R /Names << /JavaScript << /Names [(x) 6 0 R] >> >> >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
  null,
  "<< /S /JavaScript /JS (app.alert\\('executou'\\); this.getField\\('x'\\);) >>",
  "<< /S /JavaScript /JS (app.alert\\('executou2'\\);) >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
const stream = "BT /F1 18 Tf 20 100 Td (Texto com JavaScript hostil) Tj ET";
objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
fs.writeFileSync("fixtures/hostile.pdf", `%PDF-1.4\n${objs.map((b, i) => `${i + 1} 0 obj\n${b}\nendobj\n`).join("")}trailer\n<< /Size 8 /Root 1 0 R >>\n%%EOF\n`, "latin1");
console.log("hostile", fs.statSync("fixtures/hostile.pdf").size);
await browser.close();
