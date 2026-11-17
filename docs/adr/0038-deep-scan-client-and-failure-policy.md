# 0038. Deep scan: our own clamd client, and what happens when the scanner is down

- Status: accepted
- Date: 2026-11-18
- Related: 0003, 0017, 0037

## Context
ADR 0017 point 2 says a job scans every document with ClamAV and quarantines malware. Two things were left open: how the worker talks to the daemon, and what a document does when the scan cannot run.
- The Node clients for clamd are weak: `clamscan` 2.4.0 was last released in October 2024 and carries a local-binary mode and pools we do not use; `clamdjs` and `clamav.js` have had no release since 2022. The daemon protocol is small and documented (`zINSTREAM`, length-prefixed chunks, a zero-length end, one line of answer).
- The daemon refuses a stream larger than `StreamMaxLength` (25 MB by default), and an upload may be 100 MiB (ADR 0037).

## Decision
1. **Own client.** `apps/worker/src/tasks/clamav.ts` speaks `zINSTREAM` over `node:net`: about forty lines, no dependency (a deliberate exception to ADR 0003's preference for libraries, for the reasons above). An answer that is neither `OK` nor `FOUND` (`ERROR`, a size error, a closed or silent connection) is an error, never a clean result.
2. **Daemon settings.** The compose service sets `StreamMaxLength` to 100 MB, matching the upload limit.
3. **Fail open after the last attempt.** The job retries while the scanner is unavailable. If the last attempt also fails, the document stays `READY`, unscanned, and the failure is logged. This follows ADR 0017: the reader is hardened and exports are sanitized, so reading does not wait for the scan. The cost is that a document can stay unscanned if the scanner is down for the whole retry window; there is no record of it yet (`scannedAt` is not stored).
4. **Infection reaches every document of the file.** When the bytes are malware, every live `READY` document of the owner that uses that `StoredFile` becomes `QUARANTINED` with `rejectCode` `MALWARE_DETECTED`, in one transaction. The client learns through sync; there is no separate notification yet.

## Considered options
- **`clamscan` or `clamdjs`.** Less code to write, more to audit and no maintenance.
- **Fail closed.** Quarantine whatever cannot be scanned: safe, but one scanner outage would block every new import.

## Consequences
The protocol client has its own tests against a fake daemon, and the pipeline is tested against it; a real clamd is only exercised by hand. An unscanned `READY` document is possible and visible only in the logs until a later decision adds a stored scan state.
