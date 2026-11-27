# Subject screens — spec

- Status: approved
- Module: apps/web
- ADRs: 0015, 0041
- Related: `subject`, `_cross-cutting/sync`, `_cross-cutting/soft-delete`, `user/screens`

## Definition
The list of subjects (the home of a signed-in person) and the trash. They talk straight to the API: no local database and no offline queue yet (`sync/events`, a later slice). With no network nothing works, and the screens say so.

## Screens
| Path | What it is |
| --- | --- |
| `/` | The subjects of the person, with the number of documents of each; create, rename and delete (to the trash). Without a session it redirects to `/login`. |
| `/trash` | The trash items, newest first, each with a restore button. |

## Rules
1. The list is built from a full pull (`since=0`, following `more`): the last change of each entity wins, a deleted one is dropped, and only the entities `subject` and `document` are used. Subjects are sorted by name in pt-BR order; the count of a subject is its documents in the pull.
2. Every change is one push of one mutation: create and rename are an `upsert` of `{ id, name }`, delete is a `delete` of `{ id }`. A new subject gets a UUIDv7 generated in the browser; the `mutationId` is a UUID. After a mutation the list is pulled again; nothing is shown as changed before the server answers `applied`.
3. The name is trimmed and must have 1 to 120 characters; the client checks it before sending, and the server still decides (`SUBJECT_NAME_INVALID`).
4. Delete needs no confirmation, because it goes to the trash and is reversible (`soft-delete`); the screen says where the subject went.
5. The trash lists `GET /api/trash`: the name or title, the kind (subject, document, category, highlight, outline node, flashcard) and the date. Restoring is `POST /api/trash/{id}/restore`; `PARENT_DELETED` says the parent must be restored first.
6. Messages are chosen by the stable code: a `rejected` result (`SUBJECT_NAME_INVALID`, `SUBJECT_INVALID`, `NOT_FOUND`, `PARENT_DELETED`), a problem answer (`UNAUTHENTICATED` goes to `/login`, `RATE_LIMITED`, anything else generic) or a network failure. A failure leaves the list as it was.
7. Keyboard first: the new-subject field submits with Enter; rename opens in place with the current name selected, Enter saves, Escape cancels; focus returns to a sensible element after each action. Every control has an accessible name, and a button whose request is pending is disabled.
8. Every text is a key of `messages/pt-BR.json`.

## Acceptance criteria
- [ ] **AC-1** Given a pull with subjects and documents (and other entities), when the home opens, then it lists the subjects sorted by name, each with its document count, ignoring deleted ones and the other entities; given more than one page, then every page is followed; given none, then an empty message is shown.
- [ ] **AC-2** Given a name of 1 to 120 characters after trim, when a subject is created, then one push goes out with an `upsert` of a new UUIDv7 and the trimmed name, and the list is pulled again and shows it; given a blank or longer name, then the error is shown, the field keeps focus and nothing is sent.
- [ ] **AC-3** Given a subject, when it is renamed, then one push goes out with an `upsert` of the same id and the trimmed name and the list shows the new name; Escape cancels without a request; a blank name shows the error and sends nothing.
- [ ] **AC-4** Given a subject, when it is deleted, then one push goes out with a `delete` of its id, it leaves the list and the screen says it went to the trash.
- [ ] **AC-5** Given trash items, when `/trash` opens, then they are listed newest first with their label, kind and date, or an empty message; when one is restored, then the restore request goes out, the item leaves the trash and, for a subject, it is back on the home.
- [ ] **AC-6** Given a `rejected` result, a problem answer or a network failure, then the message of its code is shown, the list is unchanged and what was typed is kept; given `UNAUTHENTICATED`, then the person goes to `/login`; given `PARENT_DELETED` on a restore, then the message says to restore the parent first.
- [ ] **AC-7** Given a request pending, then its button is disabled and a second submit sends nothing; given any control, then it has an accessible name; given Enter in the new-subject field, then it submits.

## Open questions
- Offline use and the local database are `sync/events`; until then a lost connection loses the unsent change.
- Documents appear only as a count here: the document screens are the next slice.
