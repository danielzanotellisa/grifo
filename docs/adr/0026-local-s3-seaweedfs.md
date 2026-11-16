# 0026. Local S3-compatible storage: SeaweedFS instead of MinIO

- Status: accepted
- Date: 2026-11-15
- Amends: 0019

## Context
MinIO stopped publishing community Docker images in October 2025 and its repository was archived in 2026. The app only needs the S3 API locally; production will use a managed S3-compatible service.

## Decision
SeaweedFS (Apache-2.0) runs as the local `s3` service with a static credentials file; an init container creates the `originals`, `derived` and `backups` buckets. Application code depends only on the S3 API through the `ObjectStorage` port.

## Considered options
- MinIO mirrors/forks: unmaintained or uncertain.
- RustFS (Apache-2.0): promising but still pre-1.0.
- Garage: AGPL server; fine as a separate service but adds license friction.

## Consequences
Bucket versioning behavior on SeaweedFS must be verified for the durability tests (P-008); production relies on the provider's versioning.
