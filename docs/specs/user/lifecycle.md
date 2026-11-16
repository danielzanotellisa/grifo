# Account lifecycle — spec

- Status: draft
- Module: identity
- ADRs: 0018, 0034

## Definition
What happens to an account over time: its first sign-in, linking Google, exporting its data and deleting it.

## Invariants
1. A deleted account cannot sign in; its sessions are revoked when it is deleted and its data is purged after 30 days (database and storage).

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Sign in with Google | Links to an existing account with the same verified email. | — |
| On first sign-in | Seed default categories (category spec); the composition root provides the seed. | — |
| Delete account | Soft delete; every session revoked in the same transaction; purge job after 30 days. | — |
| Export all my data | Creates a `FULL_DATA` export (originals, JSON, .apkg) (export spec). | — |

## Acceptance criteria
- [ ] **AC-1** Given an account is deleted, then its sessions are revoked, it cannot sign in, and an already open session no longer resolves to a user.
- [ ] **AC-2** Given a user signing in for the first time, then the default categories exist.

## Open questions
- Google needs credentials in Google Cloud and its own slice.
- The purge job and the export are in their own slices.
