import { describe, expect, it } from "vitest";
import { renderClassicSummary, type SummaryDocument } from "./classic";

const node = (
  over: Partial<SummaryDocument["nodes"][number]>,
): SummaryDocument["nodes"][number] => ({
  id: "n",
  depth: 1,
  topicLevel: 1,
  role: "ITEM",
  text: "texto",
  color: null,
  page: null,
  ...over,
});
const render = (documents: SummaryDocument[], footer = "Redes") =>
  renderClassicSummary({ footer, documents }).__html;

describe("classic summary template", () => {
  it("[export/summary-pdf#AC-2] writes topics as headings by level under the document title", () => {
    const out = render([
      {
        title: "TCP",
        nodes: [
          node({ role: "TOPIC", text: "Camadas", topicLevel: 1 }),
          node({ role: "TOPIC", text: "Transporte", topicLevel: 2, depth: 2 }),
          node({ role: "TOPIC", text: "Detalhe", topicLevel: 3, depth: 3 }),
          node({ role: "TOPIC", text: "Mais fundo", topicLevel: 5, depth: 4 }),
        ],
      },
    ]);

    expect(out).toContain("<h1>TCP</h1>");
    expect(out).toContain("<h2>Camadas</h2>");
    expect(out).toContain("<h3>Transporte</h3>");
    expect(out).toContain("<h4>Detalhe</h4>");
    expect(out).toContain("<h4>Mais fundo</h4>");
  });

  it("[export/summary-pdf#AC-2] writes definitions with color and page, and items indented by depth", () => {
    const out = render([
      {
        title: "TCP",
        nodes: [
          node({ role: "DEFINITION", text: "Roteador", color: "#F7D04F", page: 3 }),
          node({ role: "DEFINITION", text: "Sem cor" }),
          node({ role: "ITEM", text: "Exemplo", depth: 3, page: 7 }),
        ],
      },
    ]);

    expect(out).toMatch(
      /<div class="definition" style="border-color:#F7D04F">[\s\S]*Roteador[\s\S]*p\. 3/,
    );
    expect(out).toMatch(/<div class="definition">[\s\S]*Sem cor/);
    expect(out).toMatch(
      /<li style="margin-left:2\.5em">Exemplo<span class="page">p\. 7<\/span><\/li>/,
    );
  });

  it("[export/summary-pdf#AC-2] says the summary is empty and starts a page for each document", () => {
    const out = render([
      { title: "Vazio", nodes: [] },
      { title: "Outro", nodes: [node({ text: "x" })] },
    ]);

    expect(out).toContain("Resumo vazio.");
    expect(out.match(/<section class="document">/g)).toHaveLength(2);
    expect(out).toContain("@page");
    expect(out).toContain("Redes");
    expect(out).not.toMatch(/<script|src=|href=/);
  });

  it("[export/summary-pdf#AC-3] escapes titles, texts and the footer, and refuses a color that is not a hex code", () => {
    const evil = '<script>alert("x")</script>';
    const out = render(
      [
        {
          title: evil,
          nodes: [
            node({ role: "TOPIC", text: evil }),
            node({ role: "DEFINITION", text: evil, color: '"><script>x</script>' }),
          ],
        },
      ],
      evil,
    );

    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(out).not.toContain('style="border-color:"');
    expect(out).toMatch(/<div class="definition">/);
  });
});
