import { v7 as uuidv7 } from "uuid";
import { fail, pullAll, pushMutation, request, type Failure, type Result } from "../../lib/api";

export type DocumentItem = {
  id: string;
  subjectId: string;
  title: string;
  status: string;
  pageCount: number | null;
  hasText?: boolean | null;
  rejectCode: string | null;
};
export type SubjectPage = {
  subject: { id: string; name: string } | null;
  documents: DocumentItem[];
};

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const TITLE_MAX = 200;

/** The subject and its live documents, from a full pull (`document/screens`). */
export async function loadSubjectPage(subjectId: string): Promise<Result<SubjectPage>> {
  const pulled = await pullAll();
  if (!pulled.ok) return pulled;

  const live = (entity: string) =>
    pulled.value
      .filter((c) => c.entity === entity && c.op === "upsert")
      .map((c) => c.data as never);
  const subject = (live("subject") as { id: string; name: string }[]).find(
    (s) => s.id === subjectId,
  );
  const documents = (live("document") as DocumentItem[]).filter((d) => d.subjectId === subjectId);
  documents.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  return {
    ok: true,
    value: { subject: subject ? { id: subject.id, name: subject.name } : null, documents },
  };
}

/** A name without its `.pdf` extension and surrounding blanks, cut to the title limit. */
export const titleFromFileName = (name: string): string =>
  name
    .replace(/\.pdf\s*$/i, "")
    .trim()
    .slice(0, TITLE_MAX);

export const isPdf = (file: File): boolean =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name.trim());

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The `PUT` of the bytes to the storage with `XMLHttpRequest`, so the progress can be read (a
 * `fetch` cannot). `signal` aborts it; the answer is the HTTP status, or 0 for a network failure.
 */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<number | "aborted"> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.onabort = () => resolve("aborted");
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    if (signal.aborted) return resolve("aborted");
    xhr.send(file);
  });
}

/**
 * The upload of one PDF: start, `PUT` straight to the storage (skipped when the server already has
 * the bytes), confirm. `onStarted` tells the screen the document exists before the bytes travel.
 * A failed `PUT` has the code `UPLOAD_PUT_FAILED`, a cancelled one `UPLOAD_CANCELLED`.
 */
export async function importPdf(
  subjectId: string,
  file: File,
  onStarted: (documentId: string) => void,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<Result<{ documentId: string }>> {
  const signal = options.signal ?? new AbortController().signal;
  const documentId = uuidv7();
  const started = await request("/api/documents/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      documentId,
      subjectId,
      title: titleFromFileName(file.name),
      sha256: await sha256Hex(file),
      sizeBytes: file.size,
    }),
  });
  if (!started.ok) return started;
  onStarted(documentId);

  const { upload } = (await started.value.json()) as {
    upload: { url: string; headers: Record<string, string> } | null;
  };
  if (upload) {
    const sent = await putWithProgress(
      upload.url,
      upload.headers,
      file,
      options.onProgress ?? (() => undefined),
      signal,
    );
    if (sent === "aborted") return fail({ code: "UPLOAD_CANCELLED" });
    if (sent < 200 || sent >= 300) return fail({ code: "UPLOAD_PUT_FAILED" });
  }

  const confirmed = await request(`/api/documents/${documentId}/confirm`, { method: "POST" });
  return confirmed.ok ? { ok: true, value: { documentId } } : confirmed;
}

export const renameDocument = (doc: DocumentItem, title: string) =>
  pushMutation("document", "upsert", { id: doc.id, subjectId: doc.subjectId, title });
export const deleteDocument = (id: string) => pushMutation("document", "delete", { id });

export type { Failure };
