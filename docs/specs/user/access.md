# Access to routes — spec

- Status: approved
- Module: identity, apps/web
- ADRs: 0016, 0034

## Definition
How every authenticated route knows the user and what it answers when it cannot.

## Rules
1. Every authenticated route resolves the session to a user id before any work, through one guard; a request with no valid session answers 401 `UNAUTHENTICATED`.
2. A deleted account does not resolve to a user, even with a session that was open when it was deleted.
3. A route that changes state with a session cookie and is not served by the authentication library checks the `Origin` itself: a missing or foreign origin answers 403 `FORBIDDEN_ORIGIN`.
4. Access to a resource of another user answers 404, never 403 (ADR 0016). Each route proves it in its own tests (`CLAUDE.md`, Testing).

## Operations
| Operation | Rules | Errors |
| --- | --- | --- |
| Who am I (`GET /api/me`) | Returns the id and email of the user of the session. | `UNAUTHENTICATED` |

## Acceptance criteria
- [ ] **AC-2** Given a request with no valid session, then a route behind the guard answers 401 `UNAUTHENTICATED` and does no work.
- [ ] **AC-3** Given a valid session, then `GET /api/me` answers the user id and email of that session.
- [ ] **AC-4** Given a session of an account that was then deleted, then the guard answers 401.
- [ ] **AC-5** Given a state-changing request with a session cookie to a route outside the authentication library, when its `Origin` is foreign or missing, then 403 `FORBIDDEN_ORIGIN` and nothing changes.

AC-1 (another user's resources answer 404) is proven route by route (rule 4); a retired criterion keeps its number.
