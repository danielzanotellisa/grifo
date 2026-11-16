# Sign in with Google — spec

- Status: draft
- Module: identity
- ADRs: 0003, 0034

## Definition
Signing in with a Google account, linking it to an existing account with the same verified email.

## Acceptance criteria
- [ ] **AC-1** Given a Google account whose verified email matches an existing account, when it signs in, then it links to that account and no second account exists.

## Open questions
- Needs credentials in Google Cloud and its own slice. The library has had advisories on account linking, so it needs its own tests.
