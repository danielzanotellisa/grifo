import { describe, expect, it } from "vitest";
import { NOTE_TYPE, stableIntId } from "./apkg/note-type";
import { html, rawHtml } from "./render/html";

describe("stableIntId", () => {
  it("is deterministic, above Anki's built-in ids and a safe integer", () => {
    const a = stableIntId("Redes::TCP");
    expect(stableIntId("Redes::TCP")).toBe(a);
    expect(a).toBeGreaterThanOrEqual(2 ** 40);
    expect(Number.isSafeInteger(a)).toBe(true);
    expect(stableIntId("Redes::UDP")).not.toBe(a);
  });
});

describe("note type", () => {
  it("keeps its frozen field list", () => {
    expect(NOTE_TYPE.fields).toEqual(["Front", "Back", "Source"]);
  });
});

describe("html template", () => {
  it("escapes interpolated user text", () => {
    const quote = '<script>alert("x")</script> & co';
    expect(html`<p>${quote}</p>`.__html).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co</p>");
  });
  it("embeds already-safe fragments untouched", () => {
    expect(html`<ul>${[rawHtml("<li>a</li>"), rawHtml("<li>b</li>")]}</ul>`.__html).toBe("<ul><li>a</li><li>b</li></ul>");
  });
});
