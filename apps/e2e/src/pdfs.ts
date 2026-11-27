import { mkdirSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encryptedPdf, plainPdf } from "../../worker/src/tasks/pdf-fixtures";

/**
 * A PDF with JavaScript in its `/OpenAction` and in its name tree, and one visible line of text:
 * opening it must run nothing (ADR 0040).
 */
export function hostilePdf(): Buffer {
  const stream = "BT /F1 18 Tf 20 100 Td (Texto com JavaScript hostil) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R /Names << /JavaScript << /Names [(x) 6 0 R] >> >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /S /JavaScript /JS (app.alert\\('executou'\\);) >>",
    "<< /S /JavaScript /JS (app.alert\\('executou2'\\);) >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  return Buffer.from(
    `%PDF-1.4\n${objects.map((body, i) => `${i + 1} 0 obj\n${body}\nendobj\n`).join("")}` +
      "trailer\n<< /Size 8 /Root 1 0 R >>\n%%EOF\n",
    "latin1",
  );
}

export const pdfBytes = {
  plain: plainPdf,
  encrypted: encryptedPdf,
  hostile: hostilePdf,
  text: textPdf,
};

/** Writes a file into `dir` and returns its path, ready for `setInputFiles`. */
export function writeFileIn(dir: string, name: string, bytes: Buffer): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

/** A sparse file just over 100 MiB: it costs no disk and no memory, and it must be refused before sending. */
export function writeHugeFileIn(dir: string, name: string): string {
  const path = writeFileIn(dir, name, Buffer.alloc(0));
  truncateSync(path, 100 * 1024 * 1024 + 1);
  return path;
}

/** A one-page PDF with two lines of real text on a 400 by 300 point page, to be selected with the mouse. */
export function textPdf(): Buffer {
  const stream =
    "BT /F1 24 Tf 40 230 Td (Primeira linha do trecho) Tj ET\nBT /F1 24 Tf 40 190 Td (Segunda linha do trecho) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  return Buffer.from(
    `%PDF-1.4\n${objects.map((body, i) => `${i + 1} 0 obj\n${body}\nendobj\n`).join("")}` +
      "trailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF\n",
    "latin1",
  );
}
