# User — spec

- Status: approved
- Module: identity
- ADRs: 0003, 0016, 0018, 0034

## Definition
A person with an account. Owns every other entity.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| id | uuid v7 | Server-generated. |
| email | text | Stored in lowercase; unique. An address with surrounding spaces is refused (400): the client trims before sending. |
| emailVerified | boolean | False until the link of the verification email is used. |
| displayName | text | Empty when not set. |
| createdAt / updatedAt / deletedAt | timestamptz | `deletedAt` set = account in deletion window (`user/lifecycle`). |

## Invariants
1. One account per normalized email.
2. No session exists for an unverified email.
3. Passwords are stored only as Argon2id hashes. Credentials and sessions can be read only by the authentication role: the application role has no access to the `identity` schema (ADR 0034).

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Sign up (email/password) | Password of 10 to 128 characters. Creates the account unverified and requests the verification email; no session. An email that already has an account answers exactly like a new one and creates nothing. | `PASSWORD_INVALID` |
| Verify email | The link of the verification email marks the email as verified. | `INVALID_TOKEN` |
| Sign in / out | Sign-in needs a verified email and gives a session cookie (`HttpOnly`, `SameSite=Lax`, `Secure` under https). Wrong password and unknown email answer the same. Sign-out ends the session; the account can end all its other sessions. | `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED` |
| Request password reset | Always answers success (no account enumeration); the email goes out through the job queue. | — |
| Reset password | A valid token sets a new password (same length rule) and ends every open session of the account. | `INVALID_TOKEN`, `PASSWORD_INVALID` |
| Protection | Sign-up, sign-in and reset are rate limited per client IP, counted in the database; cross-origin requests are refused. | `RATE_LIMITED` |

The error codes above are those of the API; the route adapter maps the answers of the authentication library to them.

## Acceptance criteria
- [ ] **AC-2** Given a password reset request for an unknown email, then the response is identical to a known email.
- [ ] **AC-3** Given a new email and a password of 10 to 128 characters, when signing up, then an unverified account exists with the normalized email and a UUIDv7 id, the password is stored as an Argon2id hash, no session is created and a verification email is requested; a shorter or longer password answers 400 and creates nothing.
- [ ] **AC-4** Given an email that already has an account (even written with other case), when signing up with it, then the answer is the same as for a new email and no second account is created.
- [ ] **AC-5** Given an account whose email is not verified, when signing in with the right password, then 403 and no session; once the verification link is used, then sign-in answers 200 with a session cookie that is `HttpOnly` and `SameSite=Lax`, and `Secure` when the base URL is https.
- [ ] **AC-6** Given a wrong password or an unknown email, when signing in, then 401 with the same answer for both.
- [ ] **AC-7** Given a valid reset token, when the password is reset, then the old password stops working, the new one works and every open session of the account is ended.
- [ ] **AC-8** Given a valid session cookie, then the request resolves to the id of its user; after sign-out the cookie resolves to nothing, and ending the other sessions keeps the current one and ends the rest.
- [ ] **AC-9** Given repeated sign-in attempts from one client IP, then they are refused with 429 after a few tries, and changing `X-Forwarded-For` does not avoid the limit; the counters are stored in the database.
- [ ] **AC-10** Given a request from another origin, or a request with a session cookie and no `Origin`, then 403 and nothing changes.
- [ ] **AC-11** Given the application role, then it cannot read users, sessions, accounts or verifications.

AC-1 (another user's resources answer 404) moved to `user/access`; a retired criterion keeps its number.
