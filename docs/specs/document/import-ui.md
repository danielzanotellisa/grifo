# Importing PDFs: drop, progress and cancel — spec

- Status: approved
- Module: apps/web
- ADRs: 0037, 0043
- Related: `document/screens`, `document/upload`

## Definition
What the import area of the subject page adds to choosing files: dropping PDFs on it, a progress bar while the bytes travel, and a way to stop a transfer. The checks, the messages and the steps of the import (`document/screens`) do not change.

## Rules
1. Dropping files on the import area imports them exactly as choosing them does: the same size and type checks and the same messages. A drop while an import is running is ignored. The area shows that it will take the files while one is dragged over it.
2. The `PUT` to the storage is made with `XMLHttpRequest` so its progress can be read. While a file travels, the import shows a progress bar (`role="progressbar"`, `aria-valuenow` from 0 to 100, the share of the bytes sent) under "Enviando N de M: nome". A file whose bytes the server already has is not sent and has no bar.
3. "Cancelar" stops the transfer under way and the ones after it. The message "Envio de “nome” cancelado." is shown; the document that was being sent stays `UPLOADED` ("Envio incompleto") and can be deleted or imported again. Files already confirmed are not touched.
4. A transfer that fails or is cancelled has the codes `UPLOAD_PUT_FAILED` and `UPLOAD_CANCELLED`; the first keeps its message of `document/screens`.

## Acceptance criteria
- [ ] **AC-1** Given PDFs dropped on the import area, then they are imported as if chosen; a file over 100 MiB or that is not a PDF is refused with the same messages; a drop while an import runs sends nothing.
- [ ] **AC-2** Given a file that is being sent, then a progress bar shows the share of its bytes already sent and goes away when the import ends; given a file whose bytes the server already has, then no bar is shown.
- [ ] **AC-3** Given "Cancelar" during a transfer, then the transfer and the files after it are not sent, the cancelled message is shown, the document stays "Envio incompleto" and the files already confirmed stay.
- [ ] **AC-4** Given the real app in a browser, when a PDF is dropped on the import area, then it is imported and becomes ready.
