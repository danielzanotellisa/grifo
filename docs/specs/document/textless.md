# Documents without selectable text — spec

- Status: approved
- Module: library (field, validation), apps/worker (detection), apps/web (warning)
- ADRs: 0037
- Related: `document`, `document/upload`, `document/screens`, `document/reader`, `highlight/screens`

## Definition
A scanned PDF is made of images and has no text layer, so nothing can be selected in the reader and no highlight can be made. The validation job detects it and records `hasText`; the screens say so instead of showing a document that looks usable and is not. Reading the text of an image (OCR) is not part of this slice.

## Rules
1. `hasText` is `true`, `false` or `null`. `null` means not checked (documents validated before this field existed): no warning is shown for it.
2. `document.validate` samples up to 10 pages spread evenly over the document (always including the first) and reads their text with the PDF parser; `hasText` is `true` when any sampled page has at least 10 characters that are not white space, else `false`. A document with a failing sample is not rejected for it: the usual failure rules of `document/upload` apply.
3. `hasText` is set by the job together with the `READY` status and is stated by the server only (a client cannot send it). A pull delivers it in the data of the `document` entity.
4. The subject page shows, on a `READY` document with `hasText: false`, the note "Sem texto selecionável" next to its status.
5. The reader shows, for a document with `hasText: false`, a notice under the top bar: "Este PDF é uma imagem escaneada e não tem texto selecionável, então não dá para marcar trechos." The document still opens and can be read.
6. Nothing is shown for `hasText: true` or `null`.

## Acceptance criteria
- [ ] **AC-1** Given a PDF with a text layer, when the validation job runs, then the document is `READY` with `hasText` `true`; given a PDF whose pages draw no text, then it is `READY` with `hasText` `false`.
- [ ] **AC-2** Given a document with 25 pages whose only text is on page 20, then the sample finds it and `hasText` is `true`; given text of fewer than 10 characters, then it is `false`.
- [ ] **AC-3** Given a pull after validation, then the `document` data carries `hasText`; given a client mutation that sends `hasText`, then it is refused as invalid.
- [ ] **AC-4** Given a subject with ready documents with `hasText` `false`, `true` and `null`, then only the first shows "Sem texto selecionável".
- [ ] **AC-5** Given the reader of a document with `hasText` `false`, then the notice is shown and the document still opens; given `true` or `null`, then no notice.
