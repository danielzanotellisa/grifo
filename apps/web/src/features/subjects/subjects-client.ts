import { v7 as uuidv7 } from "uuid";
import { pullAll, pushMutation, request, type Result } from "../../lib/api";

export type { Failure, Result } from "../../lib/api";

export type SubjectItem = { id: string; name: string; documentCount: number };
export type TrashEntry = { id: string; entity: string; label: string; deletedAt: string };

/** The subjects of the person, from a full pull (`subject/screens`). */
export async function loadSubjects(): Promise<Result<SubjectItem[]>> {
  const pulled = await pullAll();
  if (!pulled.ok) return pulled;

  const live = (entity: string) =>
    pulled.value.filter((c) => c.entity === entity && c.op === "upsert");
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

/** The id is generated here, in the browser: a UUIDv7 (ADR 0006). */
export const createSubject = (name: string) =>
  pushMutation("subject", "upsert", { id: uuidv7(), name });
export const renameSubject = (id: string, name: string) =>
  pushMutation("subject", "upsert", { id, name });
export const deleteSubject = (id: string) => pushMutation("subject", "delete", { id });

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
