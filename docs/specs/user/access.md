# Access to routes — spec

- Status: draft
- Module: identity, apps/web
- ADRs: 0016, 0034

## Definition
How every authenticated route knows the user and what it answers when it cannot.

## Rules
1. Every route resolves the session to a user id before any work; a request with no valid session answers 401.
2. Access to a resource of another user answers 404, never 403 (ADR 0016).

## Acceptance criteria
- [ ] **AC-1** Given an account, when another user requests any of its resources, then the API answers 404.
- [ ] **AC-2** Given a request with no valid session, then every route answers 401.

## Open questions
- Needs the Route Handlers and the request guard (next authentication slice).
