"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
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
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {items === null ? (
        <p className="text-neutral-500">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-neutral-600">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex-1 font-medium">{item.label}</span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                {isKind(item.entity) ? t(`kinds.${item.entity}`) : item.entity}
              </span>
              <span className="text-sm text-neutral-500">
                {t("deletedOn", {
                  date: format.dateTime(new Date(item.deletedAt), { dateStyle: "medium" }),
                })}
              </span>
              <button
                type="button"
                aria-label={t("restore", { label: item.label })}
                disabled={pending !== null}
                onClick={() => void restore(item)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60"
              >
                {t("restore", { label: "" }).trim()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
