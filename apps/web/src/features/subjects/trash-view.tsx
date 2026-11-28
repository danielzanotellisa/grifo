"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Icon } from "../../components/icons";
import { bannerError, buttonSecondary } from "../../components/styles";
import { loadTrash, restoreTrashItem, type TrashEntry } from "./subjects-client";
import { useFailureMessage } from "./use-failure-message";

const KINDS = [
  "subject",
  "document",
  "category",
  "highlight",
  "outlineNode",
  "flashcard",
  "export",
] as const;
type Kind = (typeof KINDS)[number];
const isKind = (entity: string): entity is Kind => (KINDS as readonly string[]).includes(entity);

export function TrashView() {
  const t = useTranslations("Trash");
  const format = useFormatter();
  const failureMessage = useFailureMessage("trash");
  const [items, setItems] = useState<TrashEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await loadTrash();
      if (result.ok) setItems(result.value);
      else {
        const message = failureMessage(result);
        setError(message ? `${t("loadFailed")} ${message}` : null);
        setItems([]);
      }
    })();
    // The first load runs once; the messages do not change while the screen is open.
  }, []);

  async function restore(item: TrashEntry) {
    setPending(item.id);
    setError(null);
    const result = await restoreTrashItem(item.id);
    if (result.ok) setItems((current) => current?.filter((i) => i.id !== item.id) ?? current);
    else setError(failureMessage(result));
    setPending(null);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← {t("back")}
        </Link>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink-black">
          {t("title")}
        </h1>
      </header>
      {error ? (
        <p role="alert" className={bannerError}>
          {error}
        </p>
      ) : null}
      {items === null ? (
        <p className="text-ink-muted">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 font-serif text-lg italic text-ink-muted">
          <Icon name="trash" size={18} />
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-3.5">
              <span className="flex-1 font-serif text-lg text-ink-black">{item.label}</span>
              <span className="rounded-md bg-surface-container px-2 py-0.5 text-xs font-medium text-ink-muted">
                {isKind(item.entity) ? t(`kinds.${item.entity}`) : item.entity}
              </span>
              <span className="text-sm text-ink-muted">
                {t("deletedOn", {
                  date: format.dateTime(new Date(item.deletedAt), { dateStyle: "medium" }),
                })}
              </span>
              <button
                type="button"
                aria-label={t("restore", { label: item.label })}
                disabled={pending !== null}
                onClick={() => void restore(item)}
                className={`${buttonSecondary} h-8 gap-1.5 px-3`}
              >
                <Icon name="restore" size={14} />
                {t("restore", { label: "" }).trim()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
