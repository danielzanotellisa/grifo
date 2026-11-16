# Authentication emails — spec

- Status: approved
- Module: identity, apps/worker
- ADRs: 0029, 0034, 0035

## Definition
How the verification and reset emails are produced and delivered without a token ever being readable by the application role.

## Rules
1. The callbacks of the authentication library write a row to `identity.outgoing_mail` (recipient, kind `verification` or `reset`, link) and enqueue the job `auth.sendEmail` with only `ownerId` and `mailId`. Neither step is awaited, so the response does not wait for them.
2. No link or token appears in a job payload. Only the authentication role reads `outgoing_mail`.
3. `auth.sendEmail` reads the row, sends one plain-text message with the link and deletes the row. A missing row ends the job successfully; a failed send throws, so the job is retried, and the row stays.
4. `auth.expireMail` deletes rows older than 24 hours.
5. A reset request for an unknown address writes no row and enqueues no job.

## Acceptance criteria
- [ ] **AC-1** Given a sign-up or a reset request for a known address, then a row exists for that address with its link and a job `auth.sendEmail` exists whose payload holds only `ownerId` and `mailId`, with no link or token anywhere in the job; for an unknown address there is no row and no job.
- [ ] **AC-2** Given a slow email sink, when a user signs up or requests a reset, then the response is returned without waiting for it.
- [ ] **AC-3** Given a job for an existing row, then one message goes to that address with the link in its text and the row is deleted; running the job again sends nothing and succeeds.
- [ ] **AC-4** Given a send that fails, then the job throws so it is retried, and the row is kept.
- [ ] **AC-5** Given rows older than 24 hours and newer ones, when the expiry task runs, then only the old ones are deleted.
- [ ] **AC-6** Given the application role, then it cannot read `outgoing_mail`.
