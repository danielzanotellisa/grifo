export type Bucket = "originals" | "derived" | "backups";

/**
 * Port for any S3-compatible store (SeaweedFS locally, ADR 0026; managed S3/R2 in production).
 * Originals are only ever exposed through short-lived presigned URLs, after an ownership check (ADR 0011, 0016).
 */
export interface ObjectStorage {
  presignPut(
    bucket: Bucket,
    key: string,
    opts: { contentType: string; sha256Base64: string; expiresInSeconds: number },
  ): Promise<string>;
  presignGet(
    bucket: Bucket,
    key: string,
    opts: { expiresInSeconds: number; downloadName?: string },
  ): Promise<string>;
  head(bucket: Bucket, key: string): Promise<{ sizeBytes: number } | null>;
  put(bucket: Bucket, key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(bucket: Bucket, key: string): Promise<Uint8Array>;
  delete(bucket: Bucket, key: string): Promise<void>;
}

/** Originals are content-addressed per owner: dedup never crosses accounts (ADR 0005). */
export const originalKey = (ownerId: string, sha256Hex: string): string =>
  `${ownerId}/${sha256Hex}.pdf`;
