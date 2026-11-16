# 0030. Traceability between specs, code, commits and PRs

- Status: accepted
- Date: 2026-11-15
- Related: 0021

## Context
Specs say *what* and code must agree with them, but nothing linked a PR, a commit or a test to the spec it implements. Reviewers had to guess, and an approved acceptance criterion could ship with no test.

## Decision
- **Spec id** is its path under `docs/specs` without `README.md` and `.md`: `highlight`, `highlight/right-click-menu`, `_cross-cutting/sync`. No separate id allocator.
- **Acceptance criteria** are numbered per spec and never renumbered: `- [ ] **AC-1** Given … when … then …`. A retired criterion keeps its number.
- **Reference token** is `<spec-id>#AC-<n>` (for example `highlight#AC-3`). Tests put it in the test name; implementation code may cite it in a short comment.
- **Validator** (`pnpm trace`, runs in CI) fails on: a spec whose `Status` is not `draft` or `approved`; criteria without an id or with a duplicate id; a reference to an unknown spec or criterion in `apps/` or `packages/`; an `approved` spec with a criterion that no `*.test.ts` references.
- **Commits**: `feat` and `fix` carry a `Spec: <spec-id>[#AC-n], …` footer, or `Spec: n/a`. Other types do not need it. Enforced by commitlint.
- **PRs**: the body has `- Spec:` and `- ADR:` lines (`ADR-NNNN`, or `n/a` for either). CI (`pnpm trace:pr`) fails on empty values, unknown specs, unknown criteria and unknown ADRs.

## Considered options
- Allocated ids like `UC-012` (the attlas approach): stable under renames, but needs an allocator script and a collision hook, too heavy for one developer.
- Footer required on every commit: becomes `Spec: n/a` ritual on chores and docs.
- Free-text references: cannot be validated.

## Consequences
Renaming or moving a spec changes its id and breaks references; the validator reports every one. Draft specs have no coverage requirement, so the check only bites once a spec is approved. The check is structural: it proves a test names a criterion, not that the test is good.
