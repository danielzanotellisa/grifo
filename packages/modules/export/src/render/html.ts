/**
 * Escapes user text for summary templates (ADR 0028). Every value coming from a PDF, a highlight,
 * a node or a title goes through this before entering HTML. Templates never use raw interpolation.
 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Tagged template that escapes every interpolation. Use `rawHtml` only for already-built fragments. */
export type SafeHtml = { readonly __html: string };
export const rawHtml = (fragment: string): SafeHtml => ({ __html: fragment });

export function html(strings: TemplateStringsArray, ...values: Array<string | number | SafeHtml | SafeHtml[]>): SafeHtml {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    const piece = Array.isArray(value)
      ? value.map((v) => v.__html).join("")
      : typeof value === "object"
        ? value.__html
        : escapeHtml(String(value));
    out += piece + (strings[i + 1] ?? "");
  });
  return { __html: out };
}
