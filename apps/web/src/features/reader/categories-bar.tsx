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
          className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
        >
          <span
            aria-hidden
            className="size-3 rounded-full"
            style={{ background: category.color }}
          />
          {category.name}
          {category.shortcut ? (
            <kbd className="text-xs text-neutral-500">{category.shortcut}</kbd>
          ) : null}
        </button>
      ))}
    </div>
  );
}
