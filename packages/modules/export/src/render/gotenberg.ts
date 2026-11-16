import { DomainError } from "@app/platform";
import type { SafeHtml } from "./html";

/**
 * Renders a complete HTML document to PDF through Gotenberg's Chromium route (ADR 0028).
 * Assets (fonts, images) are passed as extra files and referenced by file name in the HTML;
 * the document must not load anything from the network.
 */
export async function renderPdf(
  gotenbergUrl: string,
  document: SafeHtml,
  assets: ReadonlyArray<{ name: string; data: Uint8Array<ArrayBuffer>; type: string }> = [],
  opts: { timeoutMs?: number } = {},
): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([document.__html], { type: "text/html" }), "index.html");
  for (const asset of assets)
    form.append("files", new Blob([asset.data], { type: asset.type }), asset.name);
  form.append("preferCssPageSize", "true"); // honor @page size/margins from the template
  form.append("printBackground", "true"); // keep category colors

  const response = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!response.ok) {
    throw new DomainError("SUMMARY_RENDER_FAILED", `Renderer answered ${response.status}`, 422);
  }
  return new Uint8Array(await response.arrayBuffer());
}
