import { v7 as uuidv7 } from "uuid";

export type Failure = { code: string; retryAfterSeconds?: number };
export type Result<T> = { ok: true; value: T } | ({ ok: false } & Failure);

export type SubjectItem = { id: string; name: string; documentCount: number };
export type TrashEntry = { id: string; entity: string; label: string; deletedAt: string };

const fail = (failure: Failure): { ok: false } & Failure => ({ ok: false, ...failure });

/** Calls the API and turns a failure into its stable code (Problem Details, or a network failure). */
async function request(path: string, init?: RequestInit): Promise<Result<Response>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    return fail({ code: "NETWORK" });
  }
  if (response.ok) return { ok: true, value: response };

  const problem = (await response.json().catch(() => ({}))) as { code?: unknown };
  const retryAfter = Number(response.headers.get("retry-after"));
  return fail({
    code: typeof problem.code === "string" ? problem.code : "UNKNOWN",
    ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
  });
}

type Pulled = { entity: string; entityId: string; op: "upsert" | "delete"; data?: unknown };

/** The subjects of the person, from a full pull: the last change of an entity wins (`subject/screens`). */
export async function loadSubjects(): Promise<Result<SubjectItem[]>> {
  const latest = new Map<string, Pulled>();
  let since = 0;
  for (;;) {
    const answer = await request(`/api/sync/pull?since=${since}`);
    if (!answer.ok) return answer;
    const page = (await answer.value.json()) as {
      changes: Pulled[];
      cursor: number;
      more: boolean;
    };
    for (const change of page.changes) latest.set(`${change.entity}:${change.entityId}`, change);
    if (!page.more) break;
    since = page.cursor;
  }

  const live = (entity: string) =>
    [...latest.values()].filter((c) => c.entity === entity && c.op === "upsert");
  const counts = new Map<string, number>();
  for (const doc of live("document")) {
    const subjectId = (doc.data as { subjectId?: string }).subjectId;
    if (subjectId) counts.set(subjectId, (counts.get(subjectId) ?? 0) + 1);
  }
  const subjects = live("subject").map((c) => {
    const data = c.data as { id: string; name: string };
    return { id: data.id, name: data.name, documentCount: counts.get(data.id) ?? 0 };
  });
  subjects.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { ok: true, value: subjects };
}

/** One mutation in one push. `applied` and `duplicate` are success; a `rejected` result becomes its code. */
async function pushOne(
  op: "upsert" | "delete",
  data: Record<string, unknown>,
): Promise<Result<null>> {
  const answer = await request("/api/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mutations: [{ mutationId: crypto.randomUUID(), entity: "subject", op, data }],
    }),
  });
  if (!answer.ok) return answer;
  const { results } = (await answer.value.json()) as {
    results: { status: string; code?: string }[];
  };
  const result = results[0];
  if (result?.status === "rejected") return fail({ code: result.code ?? "UNKNOWN" });
  return { ok: true, value: null };
}

/** The id is generated here, in the browser: a UUIDv7 (ADR 0006). */
export const createSubject = (name: string) => pushOne("upsert", { id: uuidv7(), name });
export const renameSubject = (id: string, name: string) => pushOne("upsert", { id, name });
export const deleteSubject = (id: string) => pushOne("delete", { id });

export async function loadTrash(): Promise<Result<TrashEntry[]>> {
  const answer = await request("/api/trash");
  if (!answer.ok) return answer;
  const { items } = (await answer.value.json()) as { items: TrashEntry[] };
  return { ok: true, value: items };
}

export async function restoreTrashItem(id: string): Promise<Result<null>> {
  const answer = await request(`/api/trash/${encodeURIComponent(id)}/restore`, { method: "POST" });
  return answer.ok ? { ok: true, value: null } : answer;
}
