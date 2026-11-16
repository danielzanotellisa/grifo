# 0031. Repository workflow: PR-only main, worktrees, lint and format

- Status: accepted
- Date: 2026-11-15
- Related: 0012, 0021, 0030

## Context
One developer plus coding agents work in parallel. A broken or unreviewed `main` must be impossible, and parallel branches must not step on each other.

## Decision
- The GitHub repository is public so that rulesets apply (private repositories on the free plan cannot enforce them). The ruleset `main: PR only` blocks direct pushes, force pushes and deletion of `main`, requires a pull request and requires the CI checks to pass on an up-to-date branch. There are no bypass actors.
- Every change is made in a **git worktree** outside the repository, in `../grifo-worktrees/<slug>`, on its own branch. The main checkout stays on `main` and is not edited. Each worktree runs `pnpm install` once, which installs the husky hooks (`.husky/_` is generated and ignored by git).
- **ESLint** (typescript-eslint, flat config) enforces the rule that another module is imported only from `@app/<module>`. **Prettier** formats code; it ignores `docs/` and all Markdown so accepted ADRs are never rewritten, and has `embeddedLanguageFormatting: off` because it rewrote the content of `html` tagged templates. lint-staged runs both on staged files in the `pre-commit` hook.
- **Tests** stay on Vitest. Jest is not added: two runners duplicate configuration with no benefit.
- Commit format is Conventional Commits, enforced by commitlint in the `commit-msg` hook and again in CI over the PR's commits.
- TypeScript 7 has no programmatic API and typescript-eslint does not support it. `typescript` is aliased to `@typescript/typescript6` (used by ESLint and by Next.js) and `@typescript/native` provides the TS 7 `tsc` used for typechecking.

## Considered options
- GitHub Pro to keep the repository private: enforces the same rules, costs money.
- A local pre-push hook: bypassed by `--no-verify` or any clone without hooks, so it is not a guarantee.
- Jest instead of Vitest: no existing investment to protect, 13 tests would have to be migrated.

## Consequences
Source and docs are public. The alias is temporary: remove it when typescript-eslint supports TS 7.1+ (issue 10940 in its repository). New required CI checks must also be added to the ruleset.
