"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { Result } from "../../lib/api";
import {
  deleteDocument,
  importPdf,
  isPdf,
  loadSubjectPage,
  MAX_UPLOAD_BYTES,
  renameDocument,
  TITLE_MAX,
  type DocumentItem,
  type SubjectPage,
} from "./documents-client";
import { ExportButton } from "../exports/export-button";
import { useDocumentFailureMessage } from "./use-document-failure-message";

type Importing = { current: number; total: number; name: string };

export function SubjectDocumentsView({
  subjectId,
  pollMs = 2000,
}: {
  subjectId: string;
  pollMs?: number;
}) {
  const t = useTranslations("Documents");
  const tExport = useTranslations("Exports");
  const failureMessage = useDocumentFailureMessage();
  const [page, setPage] = useState<SubjectPage | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState<Importing | null>(null);
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  const pulling = useRef(false);

  /** Pulls again. `quiet` is for the polling: a failure keeps the list and says nothing. */
  async function refresh(quiet = false): Promise<void> {
    if (pulling.current) return;
    pulling.current = true;
    const result = await loadSubjectPage(subjectId);
    pulling.current = false;
    if (result.ok) setPage(result.value);
    else if (!quiet) {
      const message = failureMessage(result.ok ? { code: "UNKNOWN" } : result);
      setProblems(message ? [`${t("errors.loadFailed")} ${message}`] : []);
      setPage((current) => current ?? { subject: null, documents: [] });
    }
  }

  useEffect(() => {
    void refresh();
    // The first load runs once; the page does not change subject while it is open.
  }, []);

  const documents = page?.documents ?? [];
  const isPending = (doc: DocumentItem) =>
    doc.status === "VALIDATING" || (doc.status === "UPLOADED" && sending.has(doc.id));
  const following = documents.some(isPending);
  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => void refresh(true), pollMs);
    return () => clearInterval(timer);
  }, [following, pollMs]);

  async function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (busy.current || files.length === 0) return;
    busy.current = true;
    setNotice(null);
    const found: string[] = [];

    for (const [index, file] of files.entries()) {
      if (file.size > MAX_UPLOAD_BYTES) {
        found.push(t("errors.fileTooLarge", { name: file.name }));
        continue;
      }
      if (!isPdf(file)) {
        found.push(t("errors.notPdf", { name: file.name }));
        continue;
      }
      setImporting({ current: index + 1, total: files.length, name: file.name });
      const result = await importPdf(subjectId, file, (id) => {
        setSending((current) => new Set(current).add(id));
        void refresh(true);
      });
      setSending(new Set());
      if (!result.ok) {
        const message = failureMessage(result, file.name);
        if (message) found.push(message);
        else break; // the session is gone: nothing else can be sent
      }
      await refresh(true);
    }

    setProblems(found);
    setImporting(null);
    busy.current = false;
  }

  async function run(key: string, action: () => Promise<Result<unknown>>, onDone: () => void) {
    if (busy.current) return;
    busy.current = true;
    setPending(key);
    setProblems([]);
    setNotice(null);
    const result = await action();
    if (result.ok) {
      await refresh(true);
      onDone();
    } else {
      const message = failureMessage(result);
      setProblems(message ? [message] : []);
    }
    busy.current = false;
    setPending(null);
  }

  const invalidTitle = (title: string): string | null =>
    title.length < 1
      ? t("errors.titleRequired")
      : title.length > TITLE_MAX
        ? t("errors.titleTooLong")
        : null;

  async function onRename(event: FormEvent, doc: DocumentItem) {
    event.preventDefault();
    if (!renaming) return;
    const title = renaming.value.trim();
    const invalid = invalidTitle(title);
    if (invalid) {
      setProblems([invalid]);
      return;
    }
    await run(
      `rename-${doc.id}`,
      () => renameDocument(doc, title),
      () => setRenaming(null),
    );
  }

  function onRenameKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setRenaming(null);
      setProblems([]);
    }
  }

  function statusLabel(doc: DocumentItem): string {
    switch (doc.status) {
      case "UPLOADED":
        return sending.has(doc.id) ? t("status.uploading") : t("status.incomplete");
      case "VALIDATING":
        return t("status.validating");
      case "READY":
        return t("status.ready");
      case "QUARANTINED":
        return t("status.quarantined");
      default:
        return doc.rejectCode === "PDF_INVALID" ||
          doc.rejectCode === "PDF_ENCRYPTED" ||
          doc.rejectCode === "VALIDATION_FAILED"
          ? t(`status.${doc.rejectCode}`)
          : t("status.rejected");
    }
  }

  if (page === null) return <p className="text-neutral-500">{t("loading")}</p>;
  if (page.subject === null) {
    return (
      <section className="flex flex-col gap-3">
        {problems.length > 0 ? (
          <div role="alert" className="text-sm text-red-700">
            {problems.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        ) : null}
        <p>{t("notFound")}</p>
        <Link href="/" className="underline">
          {t("back")}
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-neutral-600 underline">
          {t("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{page.subject.name}</h1>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="import-pdfs" className="text-sm font-medium">
          {t("import")}
        </label>
        <input
          id="import-pdfs"
          type="file"
          accept="application/pdf"
          multiple
          disabled={importing !== null}
          onChange={(event) => void onChoose(event)}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-white disabled:opacity-60"
        />
        <p className="text-sm text-neutral-500">{t("importHint")}</p>
        <ExportButton
          kind="FLASHCARDS_APKG"
          scope="SUBJECT"
          scopeId={subjectId}
          label={tExport("subjectLabel")}
        />
        <ExportButton
          kind="SUMMARY_PDF"
          scope="SUBJECT"
          scopeId={subjectId}
          label={tExport("summarySubjectLabel")}
        />
        {importing ? (
          <p role="status" className="text-sm text-neutral-700">
            {t("importing", importing)}
          </p>
        ) : null}
      </div>

      {problems.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1 text-sm text-red-700">
          {problems.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-neutral-700">
          {notice}
        </p>
      ) : null}

      {documents.length === 0 ? (
        <p className="text-neutral-600">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {renaming?.id === doc.id ? (
                <form
                  onSubmit={(event) => void onRename(event, doc)}
                  noValidate
                  className="flex flex-1 flex-wrap items-center gap-2"
                >
                  <label htmlFor={`title-${doc.id}`} className="sr-only">
                    {t("renameLabel", { title: doc.title })}
                  </label>
                  <input
                    id={`title-${doc.id}`}
                    value={renaming.value}
                    autoFocus
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setRenaming({ id: doc.id, value: event.target.value })}
                    onKeyDown={onRenameKey}
                    autoComplete="off"
                    className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-1.5"
                  />
                  <button
                    type="submit"
                    disabled={pending === `rename-${doc.id}`}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                  >
                    {t("save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRenameKey({ key: "Escape" } as KeyboardEvent)}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    {t("cancel")}
                  </button>
                </form>
              ) : (
                <>
                  <span data-title className="min-w-40 flex-1 font-medium">
                    {doc.status === "READY" ? (
                      <Link
                        href={`/documents/${doc.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {doc.title}
                      </Link>
                    ) : (
                      doc.title
                    )}
                  </span>
                  <span className="text-sm text-neutral-700">{statusLabel(doc)}</span>
                  {doc.status === "READY" ? (
                    <Link href={`/documents/${doc.id}/summary`} className="text-sm underline">
                      {t("summary")}
                    </Link>
                  ) : null}
                  {doc.status === "READY" ? (
                    <Link href={`/documents/${doc.id}/flashcards`} className="text-sm underline">
                      {t("flashcards")}
                    </Link>
                  ) : null}
                  {doc.status === "READY" && doc.pageCount ? (
                    <span className="text-sm text-neutral-500">
                      {t("pages", { count: doc.pageCount })}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={t("rename", { title: doc.title })}
                    disabled={pending !== null || importing !== null}
                    onClick={() => {
                      setProblems([]);
                      setRenaming({ id: doc.id, value: doc.title });
                    }}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60"
                  >
                    {t("rename", { title: "" }).trim()}
                  </button>
                  <button
                    type="button"
                    aria-label={t("delete", { title: doc.title })}
                    disabled={pending !== null || importing !== null}
                    onClick={() =>
                      void run(
                        `delete-${doc.id}`,
                        () => deleteDocument(doc.id),
                        () => setNotice(t("movedToTrash", { title: doc.title })),
                      )
                    }
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                  >
                    {t("delete", { title: "" }).trim()}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
