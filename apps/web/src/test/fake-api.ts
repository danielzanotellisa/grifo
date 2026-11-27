import { vi } from "vitest";
import { problem } from "./render";

type Subject = { id: string; name: string };
type FakeCategory = {
  id: string;
  name: string;
  color: string;
  role: string;
  shortcut: number | null;
  position: string;
};
type FakeNode = {
  id: string;
  documentId: string;
  parentId: string | null;
  position: string;
  highlightId: string | null;
  role: string | null;
  text: string | null;
};
type FakeCard = {
  id: string;
  documentId: string;
  sourceNodeId: string | null;
  front: string;
  back: string;
};
type FakeHighlight = {
  id: string;
  documentId: string;
  categoryId: string;
  pageIndex: number;
  rects: { x1: number; y1: number; x2: number; y2: number }[];
  quote: { exact: string; prefix: string; suffix: string };
  note: string | null;
};
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
  categories: FakeCategory[] = [];
  highlights: FakeHighlight[] = [];
  nodes: FakeNode[] = [];
  flashcards: FakeCard[] = [];
  /** Every push request, as the list of its mutations (a request may carry several). */
  batches: FakeApi["pushes"][] = [];
  /** What the upload routes and the storage received, in order. */
  starts: Record<string, unknown>[] = [];
  puts: { url: string; headers: Record<string, string>; bytes: number }[] = [];
  confirms: string[] = [];
  /** The documents whose file URL was requested. */
  fileRequests: string[] = [];
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
    if (url.hostname === "storage.test" && url.pathname.startsWith("/get/")) {
      return new Response(new TextEncoder().encode("%PDF-1.4 fake"), { status: 200 });
    }
    if (url.hostname === "storage.test") return this.put(url, init);
    const file = /^\/api\/documents\/([^/]+)\/file$/.exec(url.pathname);
    if (file) return this.file(file[1]!);
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
      ...this.categories.map((c) => ({
        entity: "category",
        entityId: c.id,
        op: "upsert",
        data: c,
      })),
      ...this.highlights.map((h) => ({
        entity: "highlight",
        entityId: h.id,
        op: "upsert",
        data: h,
      })),
      ...this.nodes.map((n) => ({
        entity: "outlineNode",
        entityId: n.id,
        op: "upsert",
        data: n,
      })),
      ...this.flashcards.map((c) => ({
        entity: "flashcard",
        entityId: c.id,
        op: "upsert",
        data: c,
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
    this.batches.push(body.mutations);
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
    if (m.entity === "highlight") return { ...base, ...this.applyHighlight(m, id) };
    if (m.entity === "outlineNode") return { ...base, ...this.applyNode(m, id) };
    if (m.entity === "flashcard") return { ...base, ...this.applyFlashcard(m, id) };
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

  /** The document, text and effective role of a node, the way the study module reads them from the outline. */
  private nodeInfo(nodeId: string) {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const highlight = this.highlights.find((h) => h.id === node.highlightId);
    const category = this.categories.find((c) => c.id === highlight?.categoryId);
    return {
      documentId: node.documentId,
      text: (node.text ?? highlight?.quote.exact ?? "").trim(),
      role: node.role ?? category?.role ?? null,
    };
  }

  private applyFlashcard(m: FakeApi["pushes"][number], id: string) {
    const index = this.flashcards.findIndex((c) => c.id === id);
    if (m.op === "delete") {
      if (index < 0) return { status: "rejected", code: "NOT_FOUND" };
      const [gone] = this.flashcards.splice(index, 1);
      this.trash.unshift({
        id,
        entity: "flashcard",
        label: gone!.front,
        deletedAt: new Date().toISOString(),
      });
      return { status: "applied" };
    }
    const data = m.data as Record<string, unknown>;
    if ("refreshFromSource" in data) {
      if (index < 0) return { status: "rejected", code: "NOT_FOUND" };
      const source = this.nodeInfo(String(this.flashcards[index]!.sourceNodeId));
      if (!source) return { status: "rejected", code: "FLASHCARD_SOURCE_GONE" };
      if (source.text === "") return { status: "rejected", code: "FLASHCARD_BACK_EMPTY" };
      this.flashcards[index]!.back = source.text;
      return { status: "applied" };
    }
    if ("back" in data) {
      if (index < 0) return { status: "rejected", code: "NOT_FOUND" };
      const front = String(data.front ?? "").trim();
      const back = String(data.back ?? "").trim();
      if (front === "") return { status: "rejected", code: "FLASHCARD_FRONT_REQUIRED" };
      if (back === "") return { status: "rejected", code: "FLASHCARD_BACK_EMPTY" };
      Object.assign(this.flashcards[index]!, { front, back });
      return { status: "applied" };
    }
    const front = String(data.front ?? "").trim();
    if (front === "") return { status: "rejected", code: "FLASHCARD_FRONT_REQUIRED" };
    const source = this.nodeInfo(String(data.sourceNodeId));
    if (!source) return { status: "rejected", code: "PARENT_DELETED" };
    if (source.role !== "DEFINITION")
      return { status: "rejected", code: "FLASHCARD_REQUIRES_DEFINITION" };
    if (index >= 0) return { status: "rejected", code: "FLASHCARD_INVALID" };
    if (source.text === "") return { status: "rejected", code: "FLASHCARD_BACK_EMPTY" };
    this.flashcards.push({
      id,
      documentId: source.documentId,
      sourceNodeId: String(data.sourceNodeId),
      front,
      back: source.text,
    });
    return { status: "applied" };
  }

  private applyNode(m: FakeApi["pushes"][number], id: string) {
    const index = this.nodes.findIndex((n) => n.id === id);
    if (m.op === "delete") {
      if (index < 0) return { status: "rejected", code: "NOT_FOUND" };
      const [gone] = this.nodes.splice(index, 1);
      // the server promotes the children to the parent of the deleted node, in its place
      for (const child of this.nodes.filter((n) => n.parentId === gone!.id))
        child.parentId = gone!.parentId;
      this.trash.unshift({
        id,
        entity: "outlineNode",
        label: gone!.text ?? "",
        deletedAt: new Date().toISOString(),
      });
      return { status: "applied" };
    }
    const data = m.data as unknown as FakeNode;
    if (data.highlightId === null && (data.role === null || (data.text ?? "").trim() === "")) {
      return { status: "rejected", code: "OUTLINE_NODE_INVALID" };
    }
    if (index >= 0) this.nodes[index] = { ...data };
    else this.nodes.push({ ...data });
    return { status: "applied" };
  }

  private applyHighlight(m: FakeApi["pushes"][number], id: string) {
    const index = this.highlights.findIndex((h) => h.id === id);
    if (m.op === "delete") {
      if (index < 0) return { status: "rejected", code: "NOT_FOUND" };
      const [gone] = this.highlights.splice(index, 1);
      this.trash.unshift({
        id,
        entity: "highlight",
        label: gone!.quote.exact,
        deletedAt: new Date().toISOString(),
      });
      return { status: "applied" };
    }
    const data = m.data as unknown as FakeHighlight;
    const document = this.documents.find((d) => d.id === data.documentId);
    if (!document) return { status: "rejected", code: "PARENT_DELETED" };
    if ((document.status ?? "READY") !== "READY")
      return { status: "rejected", code: "DOCUMENT_NOT_READY" };
    if (!this.categories.some((c) => c.id === data.categoryId))
      return { status: "rejected", code: "PARENT_DELETED" };
    if (data.rects.length < 1) return { status: "rejected", code: "HIGHLIGHT_INVALID" };
    if (data.quote.exact.trim() === "") return { status: "rejected", code: "HIGHLIGHT_EMPTY" };
    if (index >= 0) {
      const current = this.highlights[index]!;
      const geometryChanged =
        JSON.stringify([current.documentId, current.pageIndex, current.rects, current.quote]) !==
        JSON.stringify([
          data.documentId,
          data.pageIndex,
          data.rects,
          { ...data.quote, exact: current.quote.exact },
        ]);
      if (geometryChanged) return { status: "rejected", code: "HIGHLIGHT_INVALID" };
      current.categoryId = data.categoryId;
      current.note = data.note;
    } else {
      this.highlights.push({ ...data });
    }
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

  private file(id: string): Response {
    this.fileRequests.push(id);
    const doc = this.documents.find((d) => d.id === id);
    if (!doc) return problem(404, "NOT_FOUND");
    if ((doc.status ?? "READY") !== "READY") return problem(409, "DOCUMENT_NOT_READY");
    return Response.json({ url: `http://storage.test/get/${id}`, expiresInSeconds: 300 });
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
