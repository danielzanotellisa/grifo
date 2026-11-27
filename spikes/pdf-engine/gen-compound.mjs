import { launch } from "./browser.mjs";
const b = await launch(); const p = await b.newPage();
const css = `body{font:12pt/1.5 "Times New Roman",serif} p{margin:0 0 10pt}`;
await p.setContent(`<!doctype html><meta charset=utf-8><html lang="pt-BR"><style>${css} .n{width:300pt}</style><div class="n">
<p>O aluno depende do apoio da família e do seu bem-<br>estar na escola, pois um trabalho orien&shy;<br>tado exige o desenvolvimento de cada estudante.</p>
<p>Outro exemplo: a análise sócio-<br>econômica e o guarda-<br>chuva são casos de compostos.</p>
<p>Texto livre que repete: o bem-estar do aluno e o bem-estar do professor são o bem-estar da escola.</p></div></html>`);
await p.pdf({ path: "fixtures/compound.pdf", format: "A4" });
await b.close();
