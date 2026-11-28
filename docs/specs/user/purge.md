# Purging deleted accounts — spec

- Status: approved
- Modules: platform, identity, library, annotation, outline, study, export; apps/worker
- ADRs: 0018, 0034, 0039
- Related: `user/lifecycle`, `_cross-cutting/purge`

## Definition
An account that was deleted (`user/lifecycle`) keeps its data for 30 days; then the daily `trash.purge` job deletes the account and everything it owns: rows of every module, objects in the storage, the change log and the identity rows. It is the part of the purge that `_cross-cutting/purge` left open.

## Rules
1. In the same run, after the usual purge, the job finds the accounts whose `deletedAt` is before the cutoff (run time minus 30 days). An account deleted within the window, or never, is not touched.
2. For those owners every module deletes all its rows, in an order that respects its own foreign keys: library (documents, subjects, then the stored files with their object first), annotation (highlights, then categories), outline, study and export (the result object first, then the row). The platform deletes the change log and the processed mutations of the owners.
3. Only when every module has succeeded for the owners does the identity module delete their rows: the user (its sessions and credentials go with it), the verifications and outgoing mails of its e-mail, and the rate-limit counters of its deletion attempts. After that the e-mail can sign up again.
4. A failure in one module does not stop the others, and the identity rows stay, so the account is found again by the next run; the job fails so the queue retries. Another owner's stored file with the same bytes is never touched (ADR 0005).
5. Running the job again, when nothing is left, changes nothing and does not fail; an object that is already gone is not an error.
6. The change log of other owners and every live account are never changed.

## Acceptance criteria
- [ ] **AC-1** Given an account deleted 31 days ago with rows in every module, in the change log and in the processed mutations, together with a live account and an account deleted 29 days ago, when the job runs, then every row of the old account is gone and the other two accounts keep all of theirs.
- [ ] **AC-2** Given the old account has stored files and an export result, then their objects and rows are gone; given another owner with the same bytes, then that owner's object and row stay.
- [ ] **AC-3** Given the old account has sessions, credentials, a verification and an outgoing mail, then they are all gone with its user, its rate-limit counter is gone, and the rows of the other two accounts stay.
- [ ] **AC-4** Given the storage fails while the job runs, then the other modules are still purged, the job fails, the user of the old account stays, and a later run with the storage back removes the rest including the user.
- [ ] **AC-5** Given the job runs twice, then the second run deletes nothing and does not fail.
- [ ] **AC-6** Given the worker, then the purge it runs is built with every module and the identity participant, so `trash.purge` also purges deleted accounts.
