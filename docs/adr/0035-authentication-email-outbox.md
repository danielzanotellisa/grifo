# 0035. Authentication emails leave through an outbox in the identity schema

- Status: accepted
- Date: 2026-11-16
- Related: 0003, 0029, 0034
- Amends: 0034 (point 6)

## Context
ADR 0034 sent verification and reset emails through the job queue (ADR 0029) so the response time would not depend on the SMTP server. Building it showed a flaw: the payload of a job is stored in the `graphile_worker` tables, which the application role reads, and the links of those emails carry the verification or reset token. A reset token is as good as a password, so putting it in a payload would leave a credential readable by the application role, which is exactly what the closed `identity` schema and the `auth_user` role prevent. The worker also runs every job with the application role and has no access to `identity`.

## Decision
- The links never enter a job. The callbacks of the authentication library write a row to `identity.outgoing_mail` (recipient, kind, link) through the authentication pool, then enqueue the job `auth.sendEmail` with only `ownerId` and `mailId`. Neither step is awaited, so the response time does not depend on them.
- Only `auth_user` reads `identity.outgoing_mail`. The worker gets `DATABASE_AUTH_URL` and runs the two authentication tasks with that pool instead of `withUser`; this is the one exception to the rule that a task runs as the application role.
- `auth.sendEmail` reads the row, sends the message by SMTP (`nodemailer`) and deletes the row. A missing row means the job already ran and ends successfully. A failure throws, so Graphile retries it (4 attempts).
- `auth.expireMail`, scheduled hourly, deletes rows older than 24 hours: the tokens have expired by then, and a send that failed for good must not keep a link forever.
- Messages are plain text. Their wording is a small pt-BR dictionary until the i18n library is chosen (`P-009`).
- The account deletion route is rate limited per user (5 attempts per 15 minutes), counted in `identity.rate_limits` with an atomic upsert, because the library limits only its own routes.
- The client IP for rate limiting comes from `x-real-ip`, which the reverse proxy sets and which must replace any value the client sent; `X-Forwarded-For` is never trusted.

## Considered options
- The link encrypted inside the payload (AES-256-GCM, key from the environment): no new table, but a cryptographic envelope of our own, against the intent of ADR 0003, and one more secret to manage.
- Sending directly from the web process without a job: no secret at rest, but it breaks the rule that slow work is a job and loses the email if the process dies during the send.

## Consequences
One more table and two more tasks, and the worker holds the credentials of a second database role. A link lives in `outgoing_mail` from the request until the send (normally seconds, at most 24 hours). Delivery is at least once: a crash after sending and before deleting the row sends the message again on retry, which is harmless for these emails.
