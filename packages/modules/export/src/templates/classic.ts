import { html, rawHtml, type SafeHtml } from "../render/html";

export const CLASSIC_TEMPLATE = { id: "classic", version: 1 } as const;

export type SummaryDocument = {
  title: string;
  nodes: {
    id: string;
    depth: number;
    topicLevel: number;
    role: "TOPIC" | "DEFINITION" | "ITEM";
    text: string;
    color: string | null;
    page: number | null;
  }[];
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** A CSS string literal: every character but letters and digits becomes a hex escape, so nothing can end the string or the rule. */
const cssString = (text: string): string =>
  `"${[...text].map((c) => (/[A-Za-z0-9 ]/.test(c) ? c : `\\${c.codePointAt(0)!.toString(16)} `)).join("")}"`;

const STYLE = (footer: string) => `
@page { size: A4; margin: 2cm 2cm 2.4cm;
  @bottom-left { content: ${cssString(footer)}; font: 9pt sans-serif; color: #666 }
  @bottom-right { content: counter(page) " / " counter(pages); font: 9pt sans-serif; color: #666 } }
body { font: 11pt/1.45 system-ui, sans-serif; color: #111 }
.document { break-before: page }
.document:first-of-type { break-before: auto }
h1 { font-size: 20pt; margin: 0 0 .6em }
h2 { font-size: 15pt; margin: 1em 0 .3em }
h3 { font-size: 13pt; margin: .9em 0 .3em }
h4 { font-size: 11.5pt; margin: .8em 0 .3em }
ul { list-style: disc; padding-left: 1.2em; margin: .2em 0 }
li { margin: .15em 0 }
.definition { border-left: 4px solid #bbb; background: #f6f6f6; padding: .35em .7em; margin: .5em 0 }
.page { color: #777; font-size: 9pt; margin-left: .5em }
.empty { color: #777; font-style: italic }
`;

const page = (n: number | null): SafeHtml =>
  n === null ? rawHtml("") : html`<span class="page">p. ${n}</span>`;

/** The `classic` v1 summary template (`export/summary-pdf`): one section per document, self-contained. */
export function renderClassicSummary(input: {
  footer: string;
  documents: SummaryDocument[];
}): SafeHtml {
  const sections = input.documents.map((document) => {
    const body =
      document.nodes.length === 0
        ? html`<p class="empty">Resumo vazio.</p>`
        : rawHtml(
            document.nodes
              .map((node): string => {
                if (node.role === "TOPIC") {
                  const tag = ["h2", "h3", "h4"][Math.min(node.topicLevel, 3) - 1]!;
                  return html`<${rawHtml(tag)}>${node.text}${page(node.page)}</${rawHtml(tag)}>`
                    .__html;
                }
                if (node.role === "DEFINITION") {
                  const style =
                    node.color && HEX_COLOR.test(node.color)
                      ? rawHtml(` style="border-color:${node.color}"`)
                      : rawHtml("");
                  return html`<div class="definition"${style}>${node.text}${page(node.page)}</div>`
                    .__html;
                }
                const indent = rawHtml(` style="margin-left:${(node.depth - 1) * 1.25}em"`);
                return html`<ul><li${indent}>${node.text}${page(node.page)}</li></ul>`.__html;
              })
              .join(""),
          );
    return html`<section class="document"><h1>${document.title}</h1>${body}</section>`;
  });

  return html`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${rawHtml(STYLE(input.footer))}</style></head><body>${sections}</body></html>`;
}
