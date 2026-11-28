"use client";

import { useTranslations } from "next-intl";
import { Icon } from "../../components/icons";
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
      className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-hairline bg-surface p-4"
    >
      <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink-black">
        <Icon name="list" size={16} className="text-ink-muted" />
        {t("panel")}
        <span className="rounded-full bg-surface-container px-2 font-mono text-xs font-medium text-ink-muted">
          {highlights.length}
        </span>
      </h2>
      {highlights.length === 0 ? (
        <p className="font-serif text-base italic text-ink-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {highlights.map((highlight) => {
            const quote = cut(highlight.quote.exact);
            return (
              <li
                key={highlight.id}
                className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-3"
              >
                <button
                  type="button"
                  aria-label={quote}
                  onClick={() => onGo(highlight)}
                  className="flex items-start gap-2 text-left font-serif text-sm italic text-ink-black"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{ background: color(highlight.categoryId) }}
                  />
                  <span>{quote}</span>
                </button>
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <span>{t("page", { page: highlight.pageIndex + 1 })}</span>
                  <select
                    aria-label={t("categoryOf", { quote })}
                    value={highlight.categoryId}
                    disabled={busy}
                    onChange={(event) => onChangeCategory(highlight, event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-divider bg-paper px-1 py-0.5 text-ink"
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
                    className="flex size-6 items-center justify-center rounded-md border border-divider text-ink-muted hover:text-error disabled:opacity-50"
                  >
                    <Icon name="trash" size={13} />
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
