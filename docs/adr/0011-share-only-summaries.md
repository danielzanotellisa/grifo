# 0011. Sharing, if ever, covers generated summaries only

- Status: accepted (sharing itself is out of scope)
- Date: 2026-11-15

## Context
Imported PDFs may be copyrighted. Deciding now how sharing would work avoids a data model that makes the guarantee hard later.

## Decision
Nothing is shareable in the MVP. If sharing arrives it applies only to generated summaries — never subjects, original PDFs or flashcards — and the architecture enforces it: originals and derived files live in separate buckets; originals are only reachable by their owner through short-lived presigned URLs; what is shared is an immutable snapshot entity with automatic source attribution, never a live reference.

## Consequences
Summaries still contain verbatim excerpts; before any public sharing, review citation limits under Brazilian law (Lei 9.610/98, art. 46) with a lawyer, and consider private links only.
