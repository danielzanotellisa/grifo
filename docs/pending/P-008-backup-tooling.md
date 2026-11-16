# P-008. Backup tooling and local versioning

- Status: open
- Blocks: durability tests of ADR 0018
- Related: ADR 0018, 0026

## Open points
1. pgBackRest vs WAL-G for base backups + WAL archiving to the `backups` bucket.
2. Run it as a sidecar container in compose so restore drills work locally.
3. Verify SeaweedFS bucket versioning behaves as needed for "restore a deleted original" tests; if not, test versioning only against the production provider.
4. Retention: 30 days for backups and versions, aligned with the trash window.

## How to close
Pick the tool, add the compose service, write the restore-drill script and an ADR.
