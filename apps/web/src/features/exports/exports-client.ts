import { fail, request, type Result } from "../../lib/api";

export type ExportView = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  error: { code: string; message: string } | null;
  downloadUrl?: string;
};

export type ExportKind = "FLASHCARDS_APKG" | "SUMMARY_PDF";

export async function requestExport(
  kind: ExportKind,
  scope: "DOCUMENT" | "SUBJECT",
  scopeId: string,
): Promise<Result<{ id: string }>> {
  const answer = await request("/api/exports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, scope, scopeId }),
  });
  return answer.ok ? { ok: true, value: (await answer.value.json()) as { id: string } } : answer;
}

export async function loadExport(id: string): Promise<Result<ExportView>> {
  const answer = await request(`/api/exports/${id}`);
  return answer.ok ? { ok: true, value: (await answer.value.json()) as ExportView } : answer;
}

/** Asks for the export and polls it until it ends; a failed export becomes its error code. */
export async function runExport(
  kind: ExportKind,
  scope: "DOCUMENT" | "SUBJECT",
  scopeId: string,
  pollMs: number,
  onWaiting: () => void,
): Promise<Result<string>> {
  const requested = await requestExport(kind, scope, scopeId);
  if (!requested.ok) return requested;
  onWaiting();
  for (;;) {
    const polled = await loadExport(requested.value.id);
    if (!polled.ok) return polled;
    const { status, downloadUrl, error } = polled.value;
    if (status === "SUCCEEDED" && downloadUrl) return { ok: true, value: downloadUrl };
    if (status === "FAILED") return fail({ code: error?.code ?? "EXPORT_FAILED" });
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
