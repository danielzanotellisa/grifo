# Document deep scan — spec

- Status: approved
- Module: library
- ADRs: 0017, 0037, 0038

## Definition
The malware scan that follows a successful validation: `READY → QUARANTINED` when ClamAV finds malware in the original. The upload and validation are in `document/upload`.

## Rules
1. When `document.validate` ends a document as `READY`, it enqueues `document.deepScan` in the same transaction, with only `ownerId` and `documentId` in the payload and a job key per document. A rejected document is not scanned.
2. The job reads the original from the storage and sends it to the ClamAV daemon. A clean answer changes nothing: the document stays `READY` and nothing is written to the change log.
3. When the daemon finds malware, every live `READY` document of the owner that uses the same `StoredFile` becomes `QUARANTINED` with `rejectCode` `MALWARE_DETECTED`, in one transaction, each recorded in the change log. Documents of other owners are never touched, even with the same bytes (ADR 0005). A `QUARANTINED` document cannot be opened (`DOCUMENT_NOT_READY`).
4. A document that is not `READY`, or is deleted, is left alone, and a job that runs twice changes nothing more than the first run.
5. If the daemon is unavailable or answers with an error, the job fails and the queue retries. If the last attempt also fails, the document stays `READY` and the failure is logged (ADR 0038 point 3).
6. The client of the daemon speaks `zINSTREAM`; an answer that is neither `OK` nor `FOUND`, a refused or silent connection, is an error, never a clean result.

## Acceptance criteria
- [ ] **AC-1** Given a document that ends validation as `READY`, then one `document.deepScan` job exists holding only the owner and document ids; given a `REJECTED` one, then none; given the validation job runs twice, then still one.
- [ ] **AC-2** Given a clean file, when the scan runs, then the document stays `READY` and the change log has no new entry.
- [ ] **AC-3** Given a file with malware used by two live documents of one owner and by one document of another owner, when the scan runs, then the two become `QUARANTINED` with `MALWARE_DETECTED` and each is in the change log, the other owner's is untouched, and opening a quarantined one answers `DOCUMENT_NOT_READY`.
- [ ] **AC-4** Given a document that is `REJECTED`, `VALIDATING`, already `QUARANTINED` or deleted, when the scan runs, then nothing changes; given the scan runs twice, then the second changes nothing.
- [ ] **AC-5** Given a daemon that is unavailable, then the job fails and is retried; given the last attempt fails too, then the document stays `READY` and the failure is logged.
- [ ] **AC-6** Given the daemon client, then it answers clean for `OK`, malware with the signature name for `FOUND`, and an error for an `ERROR` answer, a size-limit answer, a refused connection and a silent daemon; given a stream of several megabytes, then every byte reaches the daemon.

## Open questions
- No stored scan state: a document left unscanned after the last attempt is visible only in the logs.
- A document restored from the trash after being skipped here stays `READY` unscanned.
- The user is not notified beyond the status that reaches the client through sync.
