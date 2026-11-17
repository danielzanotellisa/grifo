import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createS3Storage, ensureS3Buckets, s3ConfigFromEnv } from "./s3-storage";

const config = s3ConfigFromEnv(process.env);
const storage = createS3Storage(config);
const bytes = Buffer.from("%PDF-1.4 conteudo de teste");
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("base64");

beforeAll(() => ensureS3Buckets(config));

const put = async (url: string, body: Uint8Array, checksum: string) =>
  fetch(url, {
    method: "PUT",
    body: Buffer.from(body),
    headers: { "content-type": "application/pdf", "x-amz-checksum-sha256": checksum },
  });

describe("S3 object storage", () => {
  it("[document/upload#AC-6] refuses bytes that do not match the declared hash and stores matching ones", async () => {
    const wrong = `test/${randomUUID()}.pdf`;
    const right = `test/${randomUUID()}.pdf`;
    const opts = { contentType: "application/pdf", expiresInSeconds: 60 };

    const refused = await put(
      await storage.presignPut("originals", wrong, {
        ...opts,
        sha256Base64: sha(Buffer.from("x")),
      }),
      bytes,
      sha(Buffer.from("x")),
    );
    const accepted = await put(
      await storage.presignPut("originals", right, { ...opts, sha256Base64: sha(bytes) }),
      bytes,
      sha(bytes),
    );

    expect(refused.status).toBe(400);
    expect(await storage.head("originals", wrong)).toBeNull();
    expect(accepted.status).toBe(200);
    expect(await storage.head("originals", right)).toEqual({ sizeBytes: bytes.length });
  });

  it("[document/upload#AC-9] serves an object through a presigned GET", async () => {
    const key = `test/${randomUUID()}.pdf`;
    await storage.put("originals", key, bytes, "application/pdf");

    const res = await fetch(await storage.presignGet("originals", key, { expiresInSeconds: 60 }));

    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(Buffer.from(await storage.get("originals", key))).toEqual(bytes);
  });

  it("deletes an object and answers null for a missing one", async () => {
    const key = `test/${randomUUID()}.pdf`;
    await storage.put("originals", key, bytes, "application/pdf");

    await storage.delete("originals", key);

    expect(await storage.head("originals", key)).toBeNull();
  });
});
