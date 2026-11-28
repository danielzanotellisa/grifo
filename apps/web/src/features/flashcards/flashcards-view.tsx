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
import { buttonPrimary, buttonSecondary } from "../../components/styles";

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
      setData({ document: null, cards: [] });
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/documents/${documentId}`} className="text-sm text-ink-muted underline">
          {t("back")}
        </Link>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink-black">
          {t("title")}: {data.document.title}
        </h1>
        <Link href={`/documents/${documentId}/summary`} className="text-sm underline">
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
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-ink">
          {notice}
        </p>
      ) : null}

      {data.cards.length === 0 ? (
        <p className="text-ink-muted">{t("empty")}</p>
      ) : (
        <ul aria-label={t("list")} className="flex flex-col gap-3">
          {data.cards.map((card) => (
            <li key={card.id} className="rounded-md border border-hairline p-3">
              {editing?.id === card.id ? (
                <form
                  onSubmit={(event) => void onSave(event)}
                  noValidate
                  className="flex flex-col gap-2"
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
                    className={buttonSecondary}
                  />
                  <textarea
                    aria-label={t("backField")}
                    value={editing.back}
                    rows={3}
                    onChange={(event) => setEditing({ ...editing, back: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setEditing(null);
                        setError(null);
                      }
                    }}
                    className={buttonSecondary}
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
                <div className="flex flex-col gap-2">
                  <p data-front className="font-semibold">
                    {card.front}
                  </p>
                  <p className="whitespace-pre-wrap text-ink">{card.back}</p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <button
                      type="button"
                      aria-label={t("edit", { front: card.front })}
                      onClick={() => {
                        setError(null);
                        setEditing({ id: card.id, front: card.front, back: card.back });
                      }}
                      className="underline"
                    >
                      {t("editLabel")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("refresh", { front: card.front })}
                      onClick={() => void run(() => refreshFlashcard(card.id))}
                      className="underline"
                    >
                      {t("refreshLabel")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("delete", { front: card.front })}
                      onClick={() => void onDelete(card.id, card.front)}
                      className="underline"
                    >
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
