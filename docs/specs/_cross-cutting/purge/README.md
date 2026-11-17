# Trash purge — spec

- Status: approved
- Modules: platform, library, annotation, outline, study, export; apps/worker
- ADRs: 0005, 0018, 0032, 0039

## Definition
The daily job `trash.purge` that physically deletes what has been in the trash for more than 30 days, and the stored files and result objects that nothing references any more. Deleting an account after its window is `user/purge`, a later slice.

## Rules
1. The job runs daily (crontab, 04:00) on the admin connection, across owners. The cutoff is the run time minus 30 days (`TRASH_WINDOW_DAYS`); a row is purged when its own `deleted_at` is before the cutoff. A live row, and a row deleted within the window, is never touched.
2. Each module deletes the rows of its own tables: documents, subjects, highlights, categories, outline nodes, flashcards and exports. A row deleted by cascade has the timestamp of its root and goes with it; a child trashed on its own earlier goes earlier.
3. Inside a schema the order respects the foreign keys: documents before subjects, highlights before categories. A subject is kept while any document references it, and a category while any highlight references it, in any state; a later run removes it.
4. A stored file is purged when no document, live or trashed, references it, orphans included. In one transaction that locks its row, the object is deleted from the `originals` bucket and then the row. Another owner's stored file with the same bytes is never touched (ADR 0005).
5. An export past the window is purged after its result object is deleted from the `derived` bucket. Deleting an object that no longer exists is not an error.
6. The change log is not changed: a pull of an entity that no longer exists answers a tombstone (`_cross-cutting/sync`).
7. A failure in one module does not stop the others. The job runs every module, then fails if any failed, so the queue retries. Running the job again completes what a failure left and changes nothing else.
8. A purged item is gone for good: it is not in the trash and restoring it answers 404.

## Acceptance criteria
- [ ] **AC-1** Given rows of two owners deleted 31 days ago in every module, together with live rows and rows deleted 29 days ago, when the job runs, then the old rows of both owners are gone and every other row is still there, unchanged.
- [ ] **AC-2** Given a subject deleted 31 days ago with its documents, highlights, nodes and flashcards deleted by cascade with it, and a document trashed on its own 35 days ago, then all of them are gone after one run.
- [ ] **AC-3** Given an expired category still referenced by a highlight that is not yet expired, and an expired subject still referenced by a document that is not yet expired, then both are kept and the job does not fail; after the referencing rows expire, a later run removes them.
- [ ] **AC-4** Given a stored file whose last document is purged, then its object and row are gone; given another document of the owner, live or trashed, still referencing it, then both stay; given another owner with the same bytes, then that owner's object and row stay.
- [ ] **AC-5** Given a stored file with no document at all, then the job removes its object and row.
- [ ] **AC-6** Given the job runs twice, then the second run deletes nothing and does not fail, including when an object was already deleted.
- [ ] **AC-7** Given the storage fails while the job runs, then the other modules are still purged, the job fails, the rows of the affected files stay, and a later run with the storage back completes the purge.
- [ ] **AC-8** Given a purged document, then it is not in the trash, restoring it answers 404, and a pull of its id after an earlier change answers a tombstone.
- [ ] **AC-9** Given an export past the window with a result object, then the object and the row are gone; given one within the window, then both stay.
- [ ] **AC-10** Given the worker, then `trash.purge` is registered in the task list and runs through the crontab entry.

## Open questions
- Purging deleted accounts (`user/purge`).
- Trimming the change log (`docs/pending/P-007`, point 1).
- Versions of an object: the local storage is not versioned; the managed storage of production must also drop versions (P-008).
