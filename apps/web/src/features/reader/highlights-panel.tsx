"use client";

import { useTranslations } from "next-intl";
import type { Category, HighlightItem } from "./highlights-client";

const QUOTE_MAX = 120;
const cut = (quote: string) => (quote.length > QUOTE_MAX ? `${quote.slice(0, QUOTE_MAX)}…` : quote);

/** The highlights of the document, in reading order: go to the page, change the category, delete. */
export function HighlightsPanel({
  highlights,
  categories,
  busy,
  onGo,
  onChangeCategory,
  onDelete,
}: {
  highlights: HighlightItem[];
  categories: Category[];
  busy: boolean;
  onGo: (highlight: HighlightItem) => void;
  onChangeCategory: (highlight: HighlightItem, categoryId: string) => void;
  onDelete: (highlight: HighlightItem) => void;
}) {
  const t = useTranslations("Highlights");
  const color = (id: string) => categories.find((c) => c.id === id)?.color ?? "#9ca3af";
  return (
    <aside
      aria-label={t("panel")}
      className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-l border-neutral-200 p-3"
    >
      <h2 className="text-sm font-semibold">{t("panel")}</h2>
      {highlights.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {highlights.map((highlight) => {
            const quote = cut(highlight.quote.exact);
            return (
              <li
                key={highlight.id}
                className="flex flex-col gap-1 rounded-md border border-neutral-200 p-2"
              >
                <button
                  type="button"
                  aria-label={quote}
                  onClick={() => onGo(highlight)}
                  className="flex items-start gap-2 text-left text-sm"
                >
                  <span
                    aria-hidden
                    className="mt-1 size-3 shrink-0 rounded-full"
                    style={{ background: color(highlight.categoryId) }}
                  />
                  <span>{quote}</span>
                </button>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>{t("page", { page: highlight.pageIndex + 1 })}</span>
                  <select
                    aria-label={t("categoryOf", { quote })}
                    value={highlight.categoryId}
                    disabled={busy}
                    onChange={(event) => onChangeCategory(highlight, event.target.value)}
                    className="min-w-0 flex-1 rounded border border-neutral-300 px-1 py-0.5"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={t("delete", { quote })}
                    disabled={busy}
                    onClick={() => onDelete(highlight)}
                    className="rounded border border-neutral-300 px-2 py-0.5 text-red-700 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
