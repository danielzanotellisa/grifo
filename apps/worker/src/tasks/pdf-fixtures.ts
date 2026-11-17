/** Small hand-built PDFs for the validation tests. Offsets are not computed: the parser rebuilds the xref. */
const wrap = (objects: string[], trailerExtra = ""): Buffer =>
  Buffer.from(
    `%PDF-1.4\n${objects.map((body, i) => `${i + 1} 0 obj\n${body}\nendobj\n`).join("")}` +
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>\n%%EOF\n`,
    "latin1",
  );

const pages = (count: number) =>
  Array.from({ length: count }, () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>");

const base = (count: number, catalogExtra = "", extraObjects: string[] = []): string[] => [
  `<< /Type /Catalog /Pages 2 0 R ${catalogExtra}>>`,
  `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${3 + i} 0 R`).join(" ")}] /Count ${count} >>`,
  ...pages(count),
  ...extraObjects,
];

export const plainPdf = (pageCount = 3): Buffer => wrap(base(pageCount));

export const openActionPdf = (): Buffer =>
  wrap(base(1, "/OpenAction << /S /Launch /F (calc.exe) >> "));

export const javascriptPdf = (): Buffer =>
  wrap(
    base(1, "/Names << /JavaScript << /Names [(x) 4 0 R] >> >> ", [
      "<< /S /JavaScript /JS (app.alert\\(1\\)) >>",
    ]),
  );

/** An Encrypt dictionary whose user password is not empty: opening it needs a password. */
export const encryptedPdf = (): Buffer =>
  wrap(
    [
      ...base(1),
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4 /O <${"ab".repeat(32)}> /U <${"cd".repeat(32)}> >>`,
    ],
    "/Encrypt 4 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>] ",
  );

export const truncatedPdf = (): Buffer =>
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog", "latin1");
