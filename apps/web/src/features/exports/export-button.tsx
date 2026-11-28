"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Failure } from "../../lib/api";
import { runExport, type ExportKind } from "./exports-client";

const startDownload = (url: string) => window.location.assign(url);

/** Asks for an export of a document or subject, waits for the job and downloads the file (`export/apkg`, `export/summary-pdf`). */
export function ExportButton({
  kind,
  scope,
  scopeId,
  label,
  pollMs = 1000,
  onDownload = startDownload,
}: {
  kind: ExportKind;
  scope: "DOCUMENT" | "SUBJECT";
  scopeId: string;
  label: string;
  pollMs?: number;
  onDownload?: (url: string) => void;
}) {
  const t = useTranslations("Exports");
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const messageOf = (failure: Failure): string | null => {
    switch (failure.code) {
      case "UNAUTHENTICATED":
        router.push("/login");
        return null;
      case "EXPORT_FAILED":
        return t("errors.failed");
      case "EXPORT_ACTIVE_CONTENT":
        return t("errors.activeContent");
      case "NOT_FOUND":
        return t("errors.notFound");
      case "RATE_LIMITED":
        return failure.retryAfterSeconds
          ? t("errors.rateLimited", { seconds: failure.retryAfterSeconds })
          : t("errors.rateLimitedNoTime");
      case "NETWORK":
        return t("errors.network");
      default:
        return t("errors.generic");
    }
  };

  async function onClick() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setWorking(true);
    const result = await runExport(kind, scope, scopeId, pollMs, () => undefined);
    if (result.ok) onDownload(result.value);
    else setError(messageOf(result));
    setWorking(false);
    busy.current = false;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={working}
        onClick={() => void onClick()}
        className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60"
      >
        {working ? t("working") : label}
      </button>
      {working ? (
        <p role="status" className="text-sm text-neutral-600">
          {t("generating")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
