import type { InspectResult } from "@app/library";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/** Keys the parser does not report; counted in the raw bytes, so a lower bound (ADR 0037). */
const RAW_KEYS = {
  openAction: /\/OpenAction(?![A-Za-z0-9])/g,
  additionalActions: /\/AA(?![A-Za-z0-9])/g,
  launch: /\/Launch(?![A-Za-z0-9])/g,
  xfa: /\/XFA(?![A-Za-z0-9])/g,
} as const;

const INVALID_PDF = new Set(["InvalidPDFException", "MissingPDFException", "FormatError"]);

const TEXT_SAMPLE_PAGES = 10;
const MIN_TEXT_CHARACTERS = 10;

/** Up to 10 pages spread evenly over the document, the first and the last always included. */
const sampledPages = (count: number): number[] => {
  const size = Math.min(count, TEXT_SAMPLE_PAGES);
  if (size === 1) return [1];
  return [
    ...new Set(
      Array.from({ length: size }, (_, i) => Math.floor((i * (count - 1)) / (size - 1)) + 1),
    ),
  ];
};

/** Whether any sampled page carries text: a scanned PDF draws only images (`document/textless`). */
async function hasTextLayer(doc: pdfjs.PDFDocumentProxy): Promise<boolean> {
  for (const number of sampledPages(doc.numPages)) {
    const content = await (await doc.getPage(number)).getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join("");
    if (text.replaceAll(/\s/g, "").length >= MIN_TEXT_CHARACTERS) return true;
  }
  return false;
}

/**
 * Parses a PDF with `pdfjs-dist`: XFA off, nothing rendered (version 6 has no eval path to disable). Only a password-protected
 * file and a file that is not a PDF are verdicts; any other failure is thrown so the job retries.
 */
export async function inspectPdf(bytes: Uint8Array): Promise<InspectResult> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    enableXfa: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const riskFlags: Record<string, number> = {};
    if (await doc.hasJSActions()) riskFlags.javascript = 1;
    const attachments = (await doc.getAttachments()) as Record<string, unknown> | null;
    const embedded = attachments ? Object.keys(attachments).length : 0;
    if (embedded > 0) riskFlags.embeddedFiles = embedded;

    const raw = Buffer.from(bytes).toString("latin1");
    for (const [flag, pattern] of Object.entries(RAW_KEYS)) {
      const count = raw.match(pattern)?.length ?? 0;
      if (count > 0) riskFlags[flag] = count;
    }
    return { ok: true, pageCount: doc.numPages, riskFlags, hasText: await hasTextLayer(doc) };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") return { ok: false, code: "PDF_ENCRYPTED" };
    if (INVALID_PDF.has(name)) return { ok: false, code: "PDF_INVALID" };
    throw error;
  } finally {
    await task.destroy();
  }
}
