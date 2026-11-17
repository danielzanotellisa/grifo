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
    return { ok: true, pageCount: doc.numPages, riskFlags };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") return { ok: false, code: "PDF_ENCRYPTED" };
    if (INVALID_PDF.has(name)) return { ok: false, code: "PDF_INVALID" };
    throw error;
  } finally {
    await task.destroy();
  }
}
