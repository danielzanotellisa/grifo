export type Failure = { code: string; retryAfterSeconds?: number };
export type Result<T> = { ok: true; value: T } | ({ ok: false } & Failure);

export const fail = (failure: Failure): { ok: false } & Failure => ({ ok: false, ...failure });

/** Calls the API and turns a failure into its stable code (Problem Details, or a network failure). */
export async function request(path: string, init?: RequestInit): Promise<Result<Response>> {
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

export type Pulled = { entity: string; entityId: string; op: "upsert" | "delete"; data?: unknown };

/** A full pull (`since=0`, following `more`): the last change of each entity wins. */
export async function pullAll(): Promise<Result<Pulled[]>> {
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
  return { ok: true, value: [...latest.values()] };
}

/** One mutation in one push. `applied` and `duplicate` are success; a `rejected` result becomes its code. */
export async function pushMutation(
  entity: string,
  op: "upsert" | "delete",
  data: Record<string, unknown>,
): Promise<Result<null>> {
  const answer = await request("/api/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mutations: [{ mutationId: crypto.randomUUID(), entity, op, data }] }),
  });
  if (!answer.ok) return answer;
  const { results } = (await answer.value.json()) as {
    results: { status: string; code?: string }[];
  };
  const result = results[0];
  return result?.status === "rejected"
    ? fail({ code: result.code ?? "UNKNOWN" })
    : { ok: true, value: null };
}
