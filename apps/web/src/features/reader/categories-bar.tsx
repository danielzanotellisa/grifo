"use client";

import { useTranslations } from "next-intl";
import type { Category } from "./highlights-client";

/** The categories with their color and shortcut; the buttons mark the current selection. */
export function CategoriesBar({
  categories,
  enabled,
  onChoose,
}: {
  categories: Category[];
  enabled: boolean;
  onChoose: (categoryId: string) => void;
}) {
  const t = useTranslations("Highlights");
  return (
    <div role="group" aria-label={t("categories")} className="flex flex-wrap items-center gap-2">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          disabled={!enabled}
          onClick={() => onChoose(category.id)}
          className="flex h-6 items-center gap-1.5 rounded-md border border-hairline bg-paper px-2 text-sm text-ink hover:bg-surface-container disabled:opacity-60"
        >
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: category.color }}
          />
          {category.name}
          {category.shortcut ? (
            <kbd className="rounded-sm bg-surface-container px-1 font-mono text-[11px] text-ink-muted">
              {category.shortcut}
            </kbd>
          ) : null}
        </button>
      ))}
    </div>
  );
}
