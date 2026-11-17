# 0037. Upload: the storage checks the hash, a job validates the PDF

- Status: accepted
- Date: 2026-11-17
- Amends: 0017
- Related: 0005, 0026, 0029

## Context
ADR 0017 point 1 puts the fast validation (signature, hash, size, structure) synchronously in the confirm request. Two findings from a spike against SeaweedFS and `pdfjs-dist` 6.5 change that:
- A presigned PUT that carries `x-amz-checksum-sha256` is refused by the storage when the bytes do not match (`BadDigest`, nothing stored). The hash is therefore verified by the storage at upload time, without reading the object again.
- Parsing a PDF is slow and hostile input can take long; the project rule is that nothing slow runs inside a request.
- `pdfjs-dist` reports page count, title, password protection (`PasswordException`) and the presence of JavaScript (`hasJSActions`, also when the code sits in object streams), but it reports neither `/OpenAction` nor `/Launch`. A scan of the raw bytes finds those keys only outside compressed object streams.

## Decision
1. **Confirm is cheap.** It checks that the object exists and has the declared size, moves the document `UPLOADED → VALIDATING` and enqueues `document.validate`, all in one transaction. The hash needs no check there: the storage already refused a mismatch.
2. **`document.validate` is a worker job.** It reads the object and answers `REJECTED` (with a stable `rejectCode`: `PDF_INVALID`, `PDF_ENCRYPTED`, `VALIDATION_FAILED` after the last attempt) or `READY` with `pageCount` and `riskFlags`. It never enqueues anything else in this decision; the deep scan (ClamAV, `READY → QUARANTINED`) is a separate job.
3. **Encrypted PDFs are rejected** when a password is needed to open them (`PDF_ENCRYPTED`). A PDF protected only by an owner password opens without one and is accepted.
4. **`riskFlags` are a lower bound, informational.** `javascript` and `embeddedFiles` come from the parser; `openAction`, `additionalActions`, `launch` and `xfa` come from a scan of the raw bytes and miss keys inside compressed object streams. They are not a security boundary: the boundary is the hardened reader, the malware scan and the sanitized exports (ADR 0017 points 2 to 4).
5. **Parser settings.** `pdfjs-dist` runs with `isEvalSupported: false` and XFA off, only in the worker.
6. **Limits.** A PDF is at most 100 MiB (`UPLOAD_TOO_LARGE`). Presigned URLs last 15 minutes for upload and 5 minutes for download.

## Considered options
- **Keep the synchronous validation of 0017.** Holds a request open for as long as a hostile file takes to parse.
- **Re-read and re-hash the object at confirm.** Duplicates what the storage already guarantees.
- **A hand-written structure walker for the risk flags.** More precise, but it is a PDF parser of our own, which ADR 0003 and the project rules say not to write.

## Consequences
A document shows `VALIDATING` for a moment after confirm, and the client learns the result through sync. The risk flags can under-report; the field and its spec say so. CI integration tests need an S3-compatible service.
