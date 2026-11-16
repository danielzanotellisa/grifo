# StoredFile — spec

- Status: draft
- Module: library
- ADRs: 0005, 0018, 0026

## Definition
The immutable bytes of an uploaded PDF in the `originals` bucket, addressed by owner + SHA-256.

## Fields
| Field | Type | Rules |
| --- | --- | --- |
| sha256 | char(64) | Lowercase hex. Unique per owner. |
| sizeBytes | bigint | Verified against the stored object. |
| storageKey | text | `<ownerId>/<sha256>.pdf`. |

## Invariants
1. Never modified or overwritten.
2. Deduplication only within the same owner.
3. Physically deleted only by the purge job when no live or trashed document references it.

## Acceptance criteria
- [ ] **AC-1** Given two users upload the same PDF, then two objects exist, one per owner.
- [ ] **AC-2** The integrity job reports any object whose recomputed SHA-256 differs from the record.
