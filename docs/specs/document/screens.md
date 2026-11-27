# Document screens — spec

- Status: approved
- Module: apps/web
- ADRs: 0005, 0017, 0037, 0041
- Related: `document`, `document/upload`, `document/deep-scan`, `subject/screens`

## Definition
The page of one subject: its documents, importing a PDF and following it until it is ready. The reader (opening a document) is the next slice. Like `subject/screens`, it talks straight to the API: no local database and no offline queue, and no SSE yet, so the status is followed by pulling again.

## Screens
| Path | What it is |
| --- | --- |
| `/subjects/{id}` | The documents of the subject, an import button, rename and delete. A subject that does not exist, is deleted or is another person's shows a not-found message with a link back. Without a session it redirects to `/login`. |
| `/` | As before, but each subject name is a link to its page. |

## Rules
1. The page pulls everything (`since=0`, following `more`), finds the subject among the live ones and lists its live documents sorted by title in pt-BR order. A document shows its title and its status: `UPLOADED` "Sending…", `VALIDATING` "Validating…", `READY` "Ready" with its page count, `REJECTED` and `QUARANTINED` with the reason of its `rejectCode`: `PDF_INVALID` (not a valid PDF), `PDF_ENCRYPTED` (a password is needed), `VALIDATION_FAILED` (could not be validated), `MALWARE_DETECTED` (blocked: malware found).
2. Importing: the person chooses one or more files; they are handled one after the other. For each: the SHA-256 is computed in the browser; `POST /api/documents/uploads` goes out with a UUIDv7 `documentId`, the subject, the title (the file name without `.pdf`, trimmed, at most 200 characters), the hash and the size; the file is sent with `PUT` to the URL and headers it returns (skipped when `upload` is null, the owner already has the bytes); then `POST /api/documents/{id}/confirm`. The document then shows up in the list.
3. While any document is `VALIDATING`, or `UPLOADED` and still being sent by this page, the page pulls again every 2 seconds; it stops when none is pending and when the page is left. A failed pull is tried again at the next tick and does not erase the list.
4. Before sending anything, a file over 100 MiB, or one that is not a PDF by its name (`.pdf`) or its type, is refused with a message; the server still validates the content (`document/upload`).
5. A failure is shown by its stable code: `UPLOAD_TOO_LARGE`, `PARENT_DELETED` and `NOT_FOUND` (the subject is gone), `UPLOAD_CONFLICT`, `UPLOAD_INCOMPLETE` (the file did not arrive whole), `RATE_LIMITED`, `UNAUTHENTICATED` (goes to `/login`), a failed `PUT`, a network failure, anything else generic. A file that fails does not stop the next ones. A document that is `UPLOADED` and is not being sent by this page (a failed upload, or one left by an earlier visit) shows as "Upload incomplete" and is not followed and can be deleted; importing the file again creates a new document (the server reuses the bytes when they were stored).
6. Rename is an `upsert` of `{ id, subjectId, title }` and delete a `delete` of `{ id }`, as in `subject/screens`; delete goes to the trash and the screen says so. The title is trimmed, 1 to 200 characters, checked before sending (`DOCUMENT_TITLE_INVALID` from the server).
7. Keyboard first and accessible: the import control is a labelled file input (`accept="application/pdf"`, `multiple`); rename opens in place with Enter to save and Escape to cancel; every control has an accessible name; the import button is disabled while a file is being handled.
8. Every text is a key of `messages/pt-BR.json`.

## Acceptance criteria
- [ ] **AC-1** Given a pull with several subjects and documents, when `/subjects/{id}` opens, then only the live documents of that subject are listed, sorted by title, each with its status and, when `READY`, its page count; given none, an empty message; given a subject that is missing or deleted, a not-found message with a link to `/`; and on `/` each subject name links to its page.
- [ ] **AC-2** Given a PDF chosen, when it is imported, then the hash sent is the SHA-256 of its bytes, the start request carries a UUIDv7, the subject, the size and the title taken from the file name, the file goes to the URL and headers given, then the confirm request goes out and the document appears in the list; given `upload` null, then nothing is sent to the storage; given several files, then they go one after the other.
- [ ] **AC-3** Given a document that is `VALIDATING`, or `UPLOADED` and being sent by the page, then the page pulls again every 2 seconds and shows the new status when it changes, ends with `READY` and its pages or with the message of its `rejectCode` or of `QUARANTINED`, and stops pulling when none is pending and when it is left; given a pull that fails meanwhile, then the list stays and the next tick tries again.
- [ ] **AC-4** Given a file over 100 MiB, or one that is not a PDF by name or type, then a message is shown and no request is sent for it, while the other chosen files still go.
- [ ] **AC-5** Given a start, a confirm or a `PUT` that fails, then the message of its code is shown and the next file still goes; given a failed `PUT`, then the document stays listed as upload incomplete and can be deleted; given `UNAUTHENTICATED`, then the person goes to `/login`.
- [ ] **AC-6** Given a document, when it is renamed, then one push goes out with the same id and subject and the trimmed title and the list shows it; Escape cancels; a blank or longer title shows the error and sends nothing; when it is deleted, then one push goes out with a `delete`, it leaves the list and the screen says it went to the trash.
- [ ] **AC-7** Given the import control, then it has an accessible name and accepts PDFs and several files; given a file being handled, then the import button is disabled and a second choice sends nothing meanwhile.

## Open questions
- No progress bar during the `PUT` (`fetch` reports none), no drag and drop, and no moving a document to another subject yet.
- Following the status by pulling every 2 seconds is replaced by the SSE of `sync/events` later.
- The title comes from the file name, not from the PDF metadata.
