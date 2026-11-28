"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Result } from "../../lib/api";
import {
  editFlashcard,
  loadFlashcards,
  refreshFlashcard,
  removeFlashcard,
  type FlashcardsData,
} from "./flashcards-client";
import { ExportButton } from "../exports/export-button";
import { useFlashcardFailureMessage } from "./use-flashcard-failure-message";
import { Icon } from "../../components/icons";
import { Notice } from "../../components/notice";
import { bannerError, buttonPrimary, buttonSecondary, inputClass } from "../../components/styles";

type Editing = { id: string; front: string; back: string };

/** The flashcards of a document: edit, update from the summary, delete (`flashcard/screens`). */
export function FlashcardsView({ documentId }: { documentId: string }) {
  const t = useTranslations("Flashcards");
  const tExport = useTranslations("Exports");
  const failureMessage = useFlashcardFailureMessage();
  const [data, setData] = useState<FlashcardsData | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  async function refresh(): Promise<void> {
    const result = await loadFlashcards(documentId);
    if (result.ok) setData(result.value);
    else if (data === null) {
      const message = failureMessage(result);
      setError(message ? `${t("errors.loadFailed")} ${message}` : null);
      setData({ document: null, subjectName: null, cards: [], pages: {} });
    }
  }
  useEffect(() => {
    void refresh();
    // The first load runs once; the page does not change document while it is open.
  }, []);

  /** One change at a time; the list is pulled again whatever the answer. */
  async function run(action: () => Promise<Result<null>>): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setError(null);
    setNotice(null);
    const result = await action();
    if (!result.ok) {
      const message = failureMessage(result);
      if (message) setError(message);
    }
    await refresh();
    busy.current = false;
    return result.ok;
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const front = editing.front.trim();
    const back = editing.back.trim();
    if (front === "") return setError(t("errors.frontRequired"));
    if (back === "") return setError(t("errors.backEmpty"));
    if (await run(() => editFlashcard(editing.id, front, back))) setEditing(null);
  }

  async function onDelete(id: string, front: string) {
    if (await run(() => removeFlashcard(id))) setNotice(t("movedToTrash", { front }));
  }

  if (data === null) return <p className="text-ink-muted">{t("loading")}</p>;
  if (data.document === null) {
    return (
      <section className="flex flex-col gap-3">
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <p>{t("notFound")}</p>
        <Link href="/" className="underline">
          {t("back")}
        </Link>
      </section>
    );
  }
  if (data.document.status !== "READY") return <p>{t("notReady")}</p>;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/documents/${documentId}`}
          className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← {t("back")}
        </Link>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink-black">
          {t("title")}: {data.document.title}
        </h1>
        <Link
          href={`/documents/${documentId}/summary`}
          className="text-sm text-ink underline underline-offset-4"
        >
          {t("toSummary")}
        </Link>
        <ExportButton
          kind="FLASHCARDS_APKG"
          scope="DOCUMENT"
          scopeId={documentId}
          label={tExport("documentLabel")}
        />
      </div>

      {error ? (
        <p role="alert" className={bannerError}>
          {error}
        </p>
      ) : null}
      {notice ? <Notice icon="trash">{notice}</Notice> : null}

      {data.cards.length === 0 ? (
        <p className="font-serif text-lg italic text-ink-muted">{t("empty")}</p>
      ) : (
        <ul aria-label={t("list")} className="flex flex-col gap-4">
          {data.cards.map((card, index) => (
            <li
              key={card.id}
              className="overflow-hidden rounded-lg border border-hairline bg-paper"
            >
              <div className="flex items-center justify-between gap-3 border-b border-hairline bg-surface-container px-4 py-2 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <Icon name="bookmark" size={13} />
                  {data.pages[card.id] === undefined
                    ? t("source", {
                        subject: data.subjectName ?? "",
                        document: data.document!.title,
                      })
                    : t("sourcePage", {
                        subject: data.subjectName ?? "",
                        document: data.document!.title,
                        page: data.pages[card.id]!,
                      })}
                </span>
                <span className="font-mono">#{String(index + 1).padStart(2, "0")}</span>
              </div>
              {editing?.id === card.id ? (
                <form
                  onSubmit={(event) => void onSave(event)}
                  noValidate
                  className="flex flex-col gap-3 p-4"
                >
                  <input
                    aria-label={t("frontField")}
                    value={editing.front}
                    autoFocus
                    onChange={(event) => setEditing({ ...editing, front: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setEditing(null);
                        setError(null);
                      }
                    }}
                    className={`${inputClass} font-serif text-lg`}
                  />
                  <textarea
                    aria-label={t("backField")}
                    value={editing.back}
                    rows={4}
                    onChange={(event) => setEditing({ ...editing, back: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setEditing(null);
                        setError(null);
                      }
                    }}
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className={buttonPrimary}>
                      {t("save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setError(null);
                      }}
                      className={buttonSecondary}
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col">
                  <div className="flex flex-col gap-4 p-5">
                    <p data-front className="font-serif text-xl text-ink-black">
                      {card.front}
                    </p>
                    <p className="whitespace-pre-wrap border-t border-dashed border-divider pt-4 text-sm leading-relaxed text-ink">
                      {card.back}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline bg-surface-low px-4 py-2 text-sm text-ink-muted">
                    <button
                      type="button"
                      aria-label={t("edit", { front: card.front })}
                      onClick={() => {
                        setError(null);
                        setEditing({ id: card.id, front: card.front, back: card.back });
                      }}
                      className="hover:text-ink hover:underline"
                    >
                      {t("editLabel")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("refresh", { front: card.front })}
                      onClick={() => void run(() => refreshFlashcard(card.id))}
                      className="hover:text-ink hover:underline"
                    >
                      {t("refreshLabel")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("delete", { front: card.front })}
                      onClick={() => void onDelete(card.id, card.front)}
                      className="ml-auto flex items-center gap-1.5 hover:text-error"
                    >
                      <Icon name="trash" size={14} />
                      {t("deleteLabel")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
