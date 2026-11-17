import {
  DomainError,
  enqueueJob,
  newId,
  notFound,
  originalKey,
  recordChange,
  withUser,
  type Db,
  type ObjectStorage,
} from "@app/platform";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { findDocument, findSubject } from "./repository";
import { documents, storedFiles } from "./schema";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const UPLOAD_URL_SECONDS = 15 * 60;
const DOWNLOAD_URL_SECONDS = 5 * 60;

const startInput = z.object({
  documentId: z.uuid(),
  subjectId: z.uuid(),
  title: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sizeBytes: z.number().int().positive(),
});

export type StartUpload = z.infer<typeof startInput>;
export type UploadTicket = {
  documentId: string;
  upload: { url: string; headers: Record<string, string> } | null;
};

const invalid = (message: string) => new DomainError("VALIDATION_FAILED", message, 400);

function parseStart(data: unknown): StartUpload {
  const parsed = startInput.safeParse(data);
  if (!parsed.success) throw invalid(z.prettifyError(parsed.error));
  const title = parsed.data.title.trim();
  if (title.length < 1 || title.length > 200) throw invalid("title must have 1 to 200 characters");
  if (parsed.data.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new DomainError("UPLOAD_TOO_LARGE", "The PDF is larger than 100 MiB", 413);
  }
  return { ...parsed.data, title };
}

const conflict = () =>
  new DomainError("UPLOAD_CONFLICT", "The document id was used for a different upload", 409);

/** The upload flow of a document: start, confirm and open (`docs/specs/document/upload.md`). */
export function createUploads(deps: { db: Db; storage: ObjectStorage }) {
  const { db, storage } = deps;

  return {
    async start(ownerId: string, data: unknown): Promise<UploadTicket> {
      const input = parseStart(data);
      const key = originalKey(ownerId, input.sha256);

      await withUser(db, ownerId, async (tx) => {
        const subject = await findSubject(tx, ownerId, input.subjectId);
        if (!subject) throw notFound("subject");
        if (subject.deletedAt)
          throw new DomainError("PARENT_DELETED", "The subject was deleted", 422);

        const [existingFile] = await tx
          .select()
          .from(storedFiles)
          .where(and(eq(storedFiles.ownerId, ownerId), eq(storedFiles.sha256, input.sha256)));
        if (existingFile && existingFile.sizeBytes !== input.sizeBytes) throw conflict();

        const existing = await findDocument(tx, ownerId, input.documentId);
        if (existing) {
          const file = existingFile && existingFile.id === existing.storedFileId;
          if (existing.deletedAt) throw notFound("document");
          if (existing.subjectId !== input.subjectId || !file) throw conflict();
          return;
        }

        const storedFileId =
          existingFile?.id ??
          (
            await tx
              .insert(storedFiles)
              .values({
                id: newId(),
                ownerId,
                sha256: input.sha256,
                sizeBytes: input.sizeBytes,
                storageKey: key,
              })
              .returning({ id: storedFiles.id })
          )[0]!.id;

        const inserted = await tx
          .insert(documents)
          .values({
            id: input.documentId,
            ownerId,
            subjectId: input.subjectId,
            storedFileId,
            title: input.title,
            status: "UPLOADED",
          })
          .onConflictDoNothing()
          .returning({ id: documents.id });
        if (inserted.length === 0) throw notFound("document");
        await recordChange(tx, {
          ownerId,
          entity: "document",
          entityId: input.documentId,
          op: "upsert",
        });
      });

      const stored = await storage.head("originals", key);
      if (stored?.sizeBytes === input.sizeBytes)
        return { documentId: input.documentId, upload: null };

      const sha256Base64 = Buffer.from(input.sha256, "hex").toString("base64");
      const url = await storage.presignPut("originals", key, {
        contentType: "application/pdf",
        sha256Base64,
        expiresInSeconds: UPLOAD_URL_SECONDS,
      });
      return {
        documentId: input.documentId,
        upload: {
          url,
          headers: { "content-type": "application/pdf", "x-amz-checksum-sha256": sha256Base64 },
        },
      };
    },

    async confirm(ownerId: string, documentId: string): Promise<{ status: string }> {
      const current = await withUser(db, ownerId, async (tx) => {
        const document = await findDocument(tx, ownerId, documentId);
        if (!document || document.deletedAt) throw notFound("document");
        const [file] = await tx
          .select()
          .from(storedFiles)
          .where(and(eq(storedFiles.ownerId, ownerId), eq(storedFiles.id, document.storedFileId)));
        return { status: document.status, file: file! };
      });
      if (current.status !== "UPLOADED") return { status: current.status };

      const stored = await storage.head("originals", current.file.storageKey);
      if (stored?.sizeBytes !== current.file.sizeBytes) {
        throw new DomainError("UPLOAD_INCOMPLETE", "The file has not been fully uploaded", 409);
      }

      return withUser(db, ownerId, async (tx) => {
        const moved = await tx
          .update(documents)
          .set({ status: "VALIDATING", updatedAt: new Date() })
          .where(
            and(
              eq(documents.ownerId, ownerId),
              eq(documents.id, documentId),
              eq(documents.status, "UPLOADED"),
            ),
          )
          .returning({ id: documents.id });
        if (moved.length === 0) {
          const document = await findDocument(tx, ownerId, documentId);
          return { status: document!.status };
        }
        await enqueueJob(
          tx,
          "document.validate",
          { ownerId, documentId },
          { jobKey: `document.validate:${documentId}` },
        );
        await recordChange(tx, { ownerId, entity: "document", entityId: documentId, op: "upsert" });
        return { status: "VALIDATING" };
      });
    },

    async open(
      ownerId: string,
      documentId: string,
    ): Promise<{ url: string; expiresInSeconds: number }> {
      const key = await withUser(db, ownerId, async (tx) => {
        const document = await findDocument(tx, ownerId, documentId);
        if (!document || document.deletedAt) throw notFound("document");
        if (document.status !== "READY") {
          throw new DomainError("DOCUMENT_NOT_READY", "The document is not ready to open", 409);
        }
        const [file] = await tx
          .select()
          .from(storedFiles)
          .where(and(eq(storedFiles.ownerId, ownerId), eq(storedFiles.id, document.storedFileId)));
        return file!.storageKey;
      });
      const url = await storage.presignGet("originals", key, {
        expiresInSeconds: DOWNLOAD_URL_SECONDS,
      });
      return { url, expiresInSeconds: DOWNLOAD_URL_SECONDS };
    },
  };
}
