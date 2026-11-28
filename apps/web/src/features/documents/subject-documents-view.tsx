"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
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
import { Icon } from "../../components/icons";
import { Notice } from "../../components/notice";
import { useUndoShortcut } from "../../components/use-undo-shortcut";
import { restoreTrashItem } from "../subjects/subjects-client";
import {
  bannerError,
  buttonPrimary,
  buttonSecondary,
  cardClass,
  inputClass,
} from "../../components/styles";
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
  const [undoId, setUndoId] = useState<string | null>(null);

  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const abort = useRef<AbortController | null>(null);
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
    await importFiles(files);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (importing !== null) return;
    void importFiles(Array.from(event.dataTransfer.files));
  }

  /** The import of the chosen or dropped files, one after the other (`document/screens`, `document/import-ui`). */
  async function importFiles(files: File[]) {
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
      const controller = new AbortController();
      abort.current = controller;
      setProgress(null);
      const result = await importPdf(
        subjectId,
        file,
        (id) => {
          setSending((current) => new Set(current).add(id));
          void refresh(true);
        },
        { onProgress: setProgress, signal: controller.signal },
      );
      setSending(new Set());
      if (!result.ok && result.code === "UPLOAD_CANCELLED") {
        found.push(t("errors.cancelled", { name: file.name }));
        await refresh(true);
        break; // the files after it are not sent either
      }
      if (!result.ok) {
        const message = failureMessage(result, file.name);
        if (message) found.push(message);
        else break; // the session is gone: nothing else can be sent
      }
      await refresh(true);
    }

    setProblems(found);
    setImporting(null);
    setProgress(null);
    abort.current = null;
    busy.current = false;
  }

  async function run(key: string, action: () => Promise<Result<unknown>>, onDone: () => void) {
    if (busy.current) return;
    busy.current = true;
    setPending(key);
    setProblems([]);
    setNotice(null);
    setUndoId(null);
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

  /** Puts the last deleted document back (`_cross-cutting/undo`). */
  async function onUndo() {
    if (!undoId || busy.current) return;
    const id = undoId;
    setNotice(null);
    setUndoId(null);
    const result = await restoreTrashItem(id);
    if (!result.ok) {
      const message = failureMessage(result);
      setProblems(message ? [message] : []);
    }
    await refresh(true);
  }
  useUndoShortcut(undoId ? () => void onUndo() : null);

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

  function statusClass(doc: DocumentItem): string {
    const base = "rounded-md px-2 py-0.5 text-xs font-medium ";
    if (doc.status === "READY") return base + "bg-success-container text-on-success-container";
    if (doc.status === "REJECTED" || doc.status === "QUARANTINED") {
      return base + "bg-error-container text-on-error-container";
    }
    return base + "bg-warning-container text-on-warning-container";
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

  if (page === null) return <p className="text-ink-muted">{t("loading")}</p>;
  if (page.subject === null) {
    return (
      <section className="flex flex-col gap-3">
        {problems.length > 0 ? (
          <div role="alert" className={bannerError}>
            {problems.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        ) : null}
        <p>{t("notFound")}</p>
        <Link href="/" className="text-sm underline underline-offset-4">
          {t("back")}
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink-black">
            {page.subject.name}
          </h1>
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
            {t("count", { count: documents.length })}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
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
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (importing === null) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`${cardClass} flex flex-col gap-3 border-dashed p-5 ${dragging ? "border-ink bg-surface-container" : ""}`}
      >
        <label
          htmlFor="import-pdfs"
          className="flex items-center gap-2 font-serif text-lg text-ink-black"
        >
          <Icon name="upload" size={18} className="text-ink-muted" />
          {t("import")}
        </label>
        <input
          id="import-pdfs"
          type="file"
          accept="application/pdf"
          multiple
          disabled={importing !== null}
          onChange={(event) => void onChoose(event)}
          className="text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-surface disabled:opacity-60"
        />
        <p className="text-sm text-ink-muted">{t("importHint")}</p>
        {dragging ? <p className="text-sm font-medium text-ink">{t("dropHint")}</p> : null}
        {importing ? (
          <div className="flex flex-col gap-2">
            <p role="status" className="text-sm text-ink">
              {t("importing", importing)}
            </p>
            {progress !== null ? (
              <div
                role="progressbar"
                aria-label={t("progress", { percent: progress })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container"
              >
                <div className="h-full bg-ink" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className={`${buttonSecondary} h-8 self-start px-3`}
            >
              {t("cancel")}
            </button>
          </div>
        ) : null}
      </div>

      {problems.length > 0 ? (
        <div role="alert" className={`${bannerError} flex-col gap-1`}>
          {problems.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      {notice ? (
        <Notice icon="trash" onUndo={undoId ? () => void onUndo() : undefined}>
          {notice}
        </Notice>
      ) : null}

      {documents.length === 0 ? (
        <p className="font-serif text-lg italic text-ink-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-2 p-4`}
            >
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
                    className={`${inputClass} min-w-48 flex-1 font-serif text-lg`}
                  />
                  <button
                    type="submit"
                    disabled={pending === `rename-${doc.id}`}
                    className={buttonPrimary}
                  >
                    {t("save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRenameKey({ key: "Escape" } as KeyboardEvent)}
                    className={buttonSecondary}
                  >
                    {t("cancel")}
                  </button>
                </form>
              ) : (
                <>
                  <span data-title className="min-w-40 flex-1 font-serif text-xl text-ink-black">
                    {doc.status === "READY" ? (
                      <Link
                        href={`/documents/${doc.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {doc.title}
                      </Link>
                    ) : (
                      doc.title
                    )}
                  </span>
                  <span className={statusClass(doc)}>{statusLabel(doc)}</span>
                  {doc.status === "READY" && doc.hasText === false ? (
                    <span className="rounded-md bg-warning-container px-2 py-0.5 text-xs font-medium text-on-warning-container">
                      {t("noText")}
                    </span>
                  ) : null}
                  {doc.status === "READY" ? (
                    <Link
                      href={`/documents/${doc.id}/summary`}
                      className={`${buttonSecondary} h-8 px-3`}
                    >
                      {t("summary")}
                    </Link>
                  ) : null}
                  {doc.status === "READY" ? (
                    <Link
                      href={`/documents/${doc.id}/flashcards`}
                      className={`${buttonSecondary} h-8 px-3`}
                    >
                      {t("flashcards")}
                    </Link>
                  ) : null}
                  {doc.status === "READY" && doc.pageCount ? (
                    <span className="font-mono text-xs text-ink-muted">
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
                    className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink disabled:opacity-60"
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("delete", { title: doc.title })}
                    disabled={pending !== null || importing !== null}
                    onClick={() =>
                      void run(
                        `delete-${doc.id}`,
                        () => deleteDocument(doc.id),
                        () => {
                          setNotice(t("movedToTrash", { title: doc.title }));
                          setUndoId(doc.id);
                        },
                      )
                    }
                    className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-sunken hover:text-error disabled:opacity-60"
                  >
                    <Icon name="trash" size={16} />
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
