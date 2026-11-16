# User — spec

- Status: draft
- Module: identity
- ADRs: 0003, 0016, 0018

## Definition
A person with an account. Owns every other entity.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| id | uuid | Server-generated. |
| email | text | Normalized (trim + lowercase); unique. |
| displayName | text? | Optional. |
| createdAt / updatedAt / deletedAt | timestamptz | `deletedAt` set = account in deletion window. |

## Invariants
1. One account per normalized email.
2. A deleted account cannot sign in; its data is purged after 30 days (database and storage).

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Sign up (email/password) | Email verification required before first use. | `EMAIL_TAKEN` |
| Sign in with Google | Links to an existing account with the same verified email. | — |
| Sign in / out | Session handling per P-005. | `INVALID_CREDENTIALS` |
| Request password reset | Always answers success (no account enumeration). | — |
| On first sign-in | Seed default categories (category spec). | — |
| Delete account | Soft delete; purge job after 30 days. | — |
| Export all my data | Creates a `FULL_DATA` export (originals, JSON, .apkg) (export spec). | — |

## Acceptance criteria
- [ ] Given an account, when another user requests any of its resources, then the API answers 404.
- [ ] Given a password reset request for an unknown email, then the response is identical to a known email.

## Open questions
- Auth library and session model: `docs/pending/P-005`.
