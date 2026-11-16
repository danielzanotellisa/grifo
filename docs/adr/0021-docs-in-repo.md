# 0021. Architecture documentation lives in the repository

- Status: accepted
- Date: 2026-11-15

## Context
Spec-driven development by one person, with documentation next to the code. ADRs explain *why*, specs explain *what*, diagrams show the system's shape.

## Decision
- ADRs in `docs/adr/NNNN-kebab-title.md`, MADR-style, in English. Accepted ADRs are not edited; a new ADR supersedes and both link to each other.
- C4 diagrams as Mermaid code in `docs/architecture/`: Context and Containers, plus a module map. (C4 = four zoom levels: Context, Containers, Components, Code.)
- Specs in `docs/specs/<entity>/`, cross-cutting ones in `docs/specs/_cross-cutting/`. Acceptance criteria cite 0014 scenarios. API contract in OpenAPI, written before implementation (tooling: P-006).
- Gaps and open decisions in `docs/pending/`.
- Precedence: if a spec contradicts an ADR, write a new ADR first, then change the spec.
- Agent instructions in `CLAUDE.md` files: one at the root, one per app and module.

## Considered options
- External wiki: drifts away from the code.
- Full arc42: too heavy for a solo project.

## Consequences
PRs that change architecture include their ADR. Diagrams are reviewed like code.
