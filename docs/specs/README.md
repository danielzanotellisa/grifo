# Specs

The *what* of the system (the *why* is in `docs/adr`). Spec-driven: behavior is specified here before it is implemented.

## Layout
- `glossary.md` — the vocabulary. Every spec uses these names.
- `<entity>/README.md` — the entity spec: definition, fields, invariants, lifecycle, operations, sync, acceptance criteria.
- `<entity>/<feature>.md` — feature specs that grow around an entity (e.g. `highlight/right-click-menu.md`).
- `_cross-cutting/<topic>/` — behavior spanning entities (sync, upload validation, auth).
- `_template.md` — copy it for new specs.

## Rules
- Status is `draft` until the developer approves it; implement only `approved` specs.
- Acceptance criteria are Given/When/Then and testable; performance and durability criteria cite ADR 0014 scenarios.
- Unknowns go to `docs/pending/` and are linked from "Open questions"; do not resolve them inside a spec silently.
- A spec that contradicts an ADR is blocked until a new ADR exists.
