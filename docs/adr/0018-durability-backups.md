# 0018. Durability: backups, point-in-time recovery, trash

- Status: accepted
- Date: 2026-11-15
- Related: 0014, 0026

## Context
Study material is kept for years; "never lose anything" is a product feature. Local-first protects against browser/network failures; this protects against server failures, user mistakes and software bugs.

## Decision
1. Database: daily base backups plus continuous WAL archiving to a separate bucket (pgBackRest or WAL-G, see P-008), enabling point-in-time recovery. `archive_timeout = 60s`.
2. Files: versioning on the originals bucket; in production, a replica elsewhere (3-2-1 rule).
3. Restore drill: a monthly job restores into a throwaway environment and checks counts and hashes.
4. Integrity: a periodic job re-hashes sampled files against their stored SHA-256.
5. Trash: every delete is soft; items stay restorable for 30 days, then the purge job deletes them, including all storage versions.
6. Full export: users can download all their data (originals, highlights and outline as JSON, flashcards as .apkg) in one archive (also LGPD portability).

## Considered options
- Daily `pg_dump` only: up to 24 h of study lost.
- Immediate hard delete: irreversible.

## Consequences
Backup storage has its own growing cost. Deleted accounts disappear from the database after the trash window and from backups when they expire (30-day retention); the privacy policy must say so.
