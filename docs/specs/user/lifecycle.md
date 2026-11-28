# Account lifecycle — spec

- Status: approved
- Module: identity
- ADRs: 0018, 0034

## Definition
What happens to an account at its edges: its first sign-in and its deletion.

## Invariants
1. A deleted account cannot sign in. Its sessions are revoked when it is deleted, and its data stays for 30 days before the purge (ADR 0018).
2. The email of a deleted account stays reserved until the purge: signing up with it answers like a new email and creates nothing.

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| On sign-in | Seeds the default categories (`category` spec) when the user has none. Idempotent; runs on every sign-in; a failure never blocks the sign-in. The composition root provides the seed. | — |
| Delete account (`POST /api/account/delete`) | Needs the current password and the same origin. Soft delete: `deletedAt` is set and every session is removed in one transaction. At most 5 attempts per user in 15 minutes. | `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `FORBIDDEN_ORIGIN`, `RATE_LIMITED` |

## Acceptance criteria
- [ ] **AC-1** Given an account with open sessions, when it is deleted with the right password, then `deletedAt` is set, every session is gone, an already open session no longer resolves to a user, signing in answers 401 with the code `INVALID_CREDENTIALS` of a wrong password, and signing up again with its email creates nothing.
- [ ] **AC-2** Given a user signing in, then the default categories exist, and signing in again creates no more.
- [ ] **AC-3** Given a delete request with a wrong or missing password, or without a session, or from a foreign origin, then 401, 401, 401 and 403 respectively and the account is unchanged.
- [ ] **AC-4** Given 5 delete attempts of one user within 15 minutes, when a 6th arrives, then 429 `RATE_LIMITED` even with the right password and the account is unchanged; attempts of other users are not counted, and the count restarts after the window.

## Open questions
- The purge of a deleted account after 30 days (database and storage) is a worker slice.
- Exporting all the user's data is in the `export` spec.
