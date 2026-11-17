import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Bucket, ObjectStorage } from "./object-storage";

export type S3Config = {
  endpoint: string;
  /** Host the browser can reach, when it differs from the one the servers use (containers). */
  publicEndpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  buckets: Record<Bucket, string>;
};

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
};

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv): S3Config {
  return {
    endpoint: required(env, "S3_ENDPOINT"),
    ...(env.S3_PUBLIC_ENDPOINT ? { publicEndpoint: env.S3_PUBLIC_ENDPOINT } : {}),
    region: env.S3_REGION ?? "us-east-1",
    accessKeyId: required(env, "S3_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "S3_SECRET_ACCESS_KEY"),
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    buckets: {
      originals: env.S3_BUCKET_ORIGINALS ?? "originals",
      derived: env.S3_BUCKET_DERIVED ?? "derived",
      backups: env.S3_BUCKET_BACKUPS ?? "backups",
    },
  };
}

const client = (config: S3Config, endpoint: string) =>
  new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

/** The S3 implementation of the storage port (ADR 0026): SeaweedFS locally, a managed service in production. */
export function createS3Storage(config: S3Config): ObjectStorage {
  const internal = client(config, config.endpoint);
  const signer = config.publicEndpoint ? client(config, config.publicEndpoint) : internal;

  return {
    // The checksum header is signed, so the storage refuses bytes that do not match (ADR 0037).
    presignPut: (bucket, key, { contentType, sha256Base64, expiresInSeconds }) =>
      getSignedUrl(
        signer,
        new PutObjectCommand({
          Bucket: config.buckets[bucket],
          Key: key,
          ContentType: contentType,
          ChecksumSHA256: sha256Base64,
        }),
        { expiresIn: expiresInSeconds, unhoistableHeaders: new Set(["x-amz-checksum-sha256"]) },
      ),

    presignGet: (bucket, key, { expiresInSeconds, downloadName }) =>
      getSignedUrl(
        signer,
        new GetObjectCommand({
          Bucket: config.buckets[bucket],
          Key: key,
          ResponseContentType: "application/pdf",
          ...(downloadName
            ? { ResponseContentDisposition: `attachment; filename="${downloadName}"` }
            : {}),
        }),
        { expiresIn: expiresInSeconds },
      ),

    async head(bucket, key) {
      try {
        const { ContentLength } = await internal.send(
          new HeadObjectCommand({ Bucket: config.buckets[bucket], Key: key }),
        );
        return { sizeBytes: ContentLength ?? 0 };
      } catch (error) {
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
          return null;
        }
        throw error;
      }
    },

    async put(bucket, key, body, contentType) {
      await internal.send(
        new PutObjectCommand({
          Bucket: config.buckets[bucket],
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async get(bucket, key) {
      const { Body } = await internal.send(
        new GetObjectCommand({ Bucket: config.buckets[bucket], Key: key }),
      );
      if (!Body) throw new Error(`Empty body for ${bucket}/${key}`);
      return Body.transformToByteArray();
    },

    async delete(bucket, key) {
      await internal.send(new DeleteObjectCommand({ Bucket: config.buckets[bucket], Key: key }));
    },
  };
}

/** Creates the buckets that do not exist yet (compose does it too; CI and tests rely on this). */
export async function ensureS3Buckets(config: S3Config): Promise<void> {
  const s3 = client(config, config.endpoint);
  for (const Bucket of Object.values(config.buckets)) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket }));
    }
  }
}
