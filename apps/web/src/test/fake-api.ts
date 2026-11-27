import { vi } from "vitest";
import { problem } from "./render";

type Subject = { id: string; name: string };
type Doc = {
  id: string;
  subjectId: string;
  title?: string;
  status?: string;
  pageCount?: number | null;
  rejectCode?: string | null;
};
type TrashItem = {
  id: string;
  entity: string;
  label: string;
  deletedAt: string;
  parentDeleted?: boolean;
};

/** What the sync and trash routes answer, held in memory, so a screen is tested against behavior and not a script. */
export class FakeApi {
  subjects: Subject[] = [];
  documents: Doc[] = [];
  trash: TrashItem[] = [];
  /** Other entities that a pull also carries (they must be ignored by the subject list). */
  others: { entity: string; entityId: string; data: unknown }[] = [];
  pageSize = 500;
  pushes: { mutationId: string; entity: string; op: string; data: Record<string, unknown> }[] = [];
  /** What the upload routes and the storage received, in order. */
  starts: Record<string, unknown>[] = [];
  puts: { url: string; headers: Record<string, string>; bytes: number }[] = [];
  confirms: string[] = [];
  /** Hashes the storage already has: a start for one of them answers `upload: null`. */
  storedHashes = new Set<string>();
  restores: string[] = [];
  pulls = 0;
  /** The next request to this path prefix fails with this answer; `network` makes it throw. */
  private failures: { prefix: string; answer: Response | "network" }[] = [];
  private rejection: string | null = null;
  /** Holds the next push until `release()` is called. */
  private gate: Promise<void> | null = null;
  release: () => void = () => undefined;

  fail(prefix: string, answer: Response | "network") {
    this.failures.push({ prefix, answer });
  }
  /** The next mutation is rejected with this code, as the server does for a deleted or foreign subject. */
  rejectNext(code: string) {
    this.rejection = code;
  }
  holdNextPush() {
    this.gate = new Promise<void>((resolve) => (this.release = resolve));
  }

  fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "http://localhost:3000");
    const failure = this.failures.findIndex((f) => url.pathname.startsWith(f.prefix));
    if (failure >= 0) {
      const { answer } = this.failures.splice(failure, 1)[0]!;
      if (answer === "network") throw new TypeError("Failed to fetch");
      return answer;
    }
    if (url.pathname === "/api/sync/pull")
      return this.pull(Number(url.searchParams.get("since") ?? 0));
    if (url.pathname === "/api/sync/push") {
      if (this.gate) {
        const gate = this.gate;
        this.gate = null;
        await gate;
      }
      return this.push(JSON.parse(String(init?.body)));
    }
    if (url.pathname === "/api/trash") return Response.json({ items: this.trash });
    if (url.pathname === "/api/documents/uploads")
      return this.start(JSON.parse(String(init?.body)));
    if (url.hostname === "storage.test") return this.put(url, init);
    const confirm = /^\/api\/documents\/([^/]+)\/confirm$/.exec(url.pathname);
    if (confirm) return this.confirm(confirm[1]!);
    const restore = /^\/api\/trash\/([^/]+)\/restore$/.exec(url.pathname);
    if (restore) return this.restore(restore[1]!);
    return problem(404, "NOT_FOUND");
  });

  private changes() {
    return [
      ...this.others.map((o) => ({
        entity: o.entity,
        entityId: o.entityId,
        op: "upsert",
        data: o.data,
      })),
      ...this.subjects.map((s) => ({
        entity: "subject",
        entityId: s.id,
        op: "upsert",
        data: { id: s.id, name: s.name },
      })),
      ...this.documents.map((d) => ({
        entity: "document",
        entityId: d.id,
        op: "upsert",
        data: {
          id: d.id,
          subjectId: d.subjectId,
          title: d.title ?? d.id,
          status: d.status ?? "READY",
          pageCount: d.pageCount === undefined ? 1 : d.pageCount,
          rejectCode: d.rejectCode ?? null,
        },
      })),
      ...this.trash.map((t) => ({ entity: t.entity, entityId: t.id, op: "delete" })),
    ];
  }

  private pull(since: number): Response {
    this.pulls++;
    const all = this.changes();
    const page = all.slice(since, since + this.pageSize);
    return Response.json({
      changes: page,
      cursor: since + page.length,
      more: since + page.length < all.length,
    });
  }

  private push(body: { mutations: FakeApi["pushes"] }): Response {
    const results = body.mutations.map((m) => {
      this.pushes.push(m);
      return this.apply(m);
    });
    return Response.json({ results, cursor: 1 });
  }

  private apply(m: FakeApi["pushes"][number]) {
    const base = { mutationId: m.mutationId };
    if (this.rejection) {
      const code = this.rejection;
      this.rejection = null;
      return { ...base, status: "rejected", code };
    }
    const id = String(m.data.id);
    if (m.entity === "document") return { ...base, ...this.applyDocument(m, id) };
    if (m.op === "upsert") {
      const name = String(m.data.name ?? "").trim();
      if (name.length < 1 || name.length > 120)
        return { ...base, status: "rejected", code: "SUBJECT_NAME_INVALID" };
      const existing = this.subjects.find((s) => s.id === id);
      if (existing) existing.name = name;
      else this.subjects.push({ id, name });
      return { ...base, status: "applied" };
    }
    const index = this.subjects.findIndex((s) => s.id === id);
    if (index < 0) return { ...base, status: "rejected", code: "NOT_FOUND" };
    const [gone] = this.subjects.splice(index, 1);
    this.documents = this.documents.filter((d) => d.subjectId !== id);
    this.trash.unshift({
      id,
      entity: "subject",
      label: gone!.name,
      deletedAt: new Date().toISOString(),
    });
    return { ...base, status: "applied" };
  }

  private applyDocument(m: FakeApi["pushes"][number], id: string) {
    const index = this.documents.findIndex((d) => d.id === id);
    if (index < 0) return { status: "rejected", code: "NOT_FOUND" };
    if (m.op === "upsert") {
      const title = String(m.data.title ?? "").trim();
      if (title.length < 1 || title.length > 200)
        return { status: "rejected", code: "DOCUMENT_TITLE_INVALID" };
      this.documents[index]!.title = title;
      return { status: "applied" };
    }
    const [gone] = this.documents.splice(index, 1);
    this.trash.unshift({
      id,
      entity: "document",
      label: gone!.title ?? id,
      deletedAt: new Date().toISOString(),
    });
    return { status: "applied" };
  }

  /** The server moves a document on its own (the validation job): the page learns it by pulling. */
  finish(id: string, change: Partial<Doc>) {
    Object.assign(
      this.documents.find((d) => d.id === id)!,
      change,
    );
  }

  private start(body: {
    documentId: string;
    subjectId: string;
    title: string;
    sha256: string;
  }): Response {
    this.starts.push(body);
    if (!this.subjects.some((s) => s.id === body.subjectId)) return problem(422, "PARENT_DELETED");
    if (!this.documents.some((d) => d.id === body.documentId)) {
      this.documents.push({
        id: body.documentId,
        subjectId: body.subjectId,
        title: body.title,
        status: "UPLOADED",
        pageCount: null,
      });
    }
    const upload = this.storedHashes.has(body.sha256)
      ? null
      : {
          url: `http://storage.test/put/${body.documentId}`,
          headers: { "content-type": "application/pdf", "x-amz-checksum-sha256": "abc" },
        };
    return Response.json({ documentId: body.documentId, upload }, { status: 201 });
  }

  private async put(url: URL, init?: RequestInit): Promise<Response> {
    const body = init?.body as Blob | ArrayBuffer | Uint8Array;
    const bytes = body instanceof Blob ? body.size : (body as ArrayBuffer).byteLength;
    this.puts.push({ url: url.href, headers: init?.headers as Record<string, string>, bytes });
    if (this.putGate) await this.putGate;
    return new Response(null, { status: 200 });
  }

  private putGate: Promise<void> | null = null;
  releasePut: () => void = () => undefined;
  /** Holds the next storage `PUT` until `releasePut()` is called. */
  holdNextPut() {
    this.putGate = new Promise<void>((resolve) => {
      this.releasePut = () => {
        this.putGate = null;
        resolve();
      };
    });
  }

  private confirm(id: string): Response {
    this.confirms.push(id);
    const doc = this.documents.find((d) => d.id === id);
    if (!doc) return problem(404, "NOT_FOUND");
    doc.status = "VALIDATING";
    return Response.json({ status: "VALIDATING" }, { status: 202 });
  }

  private restore(id: string): Response {
    this.restores.push(id);
    const index = this.trash.findIndex((t) => t.id === id);
    if (index < 0) return problem(404, "NOT_FOUND");
    const item = this.trash[index]!;
    if (item.parentDeleted) return problem(422, "PARENT_DELETED");
    this.trash.splice(index, 1);
    if (item.entity === "subject") this.subjects.push({ id: item.id, name: item.label });
    return new Response(null, { status: 204 });
  }
}
