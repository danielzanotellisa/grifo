"use client";

import { useTranslations } from "next-intl";
import type { Category } from "./highlights-client";

/** The menu that opens next to a selection: choosing a category marks it. */
export function SelectionMenu({
  categories,
  anchor,
  onChoose,
}: {
  categories: Category[];
  anchor: { x: number; y: number };
  onChoose: (categoryId: string) => void;
}) {
  const t = useTranslations("Highlights");
  return (
    <div
      role="menu"
      aria-label={t("menu")}
      style={{ left: anchor.x, top: anchor.y }}
      className="absolute z-10 flex -translate-x-1/2 flex-col rounded-md border border-neutral-200 bg-white p-1 shadow-lg"
    >
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="menuitem"
          onClick={() => onChoose(category.id)}
          className="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm hover:bg-neutral-100"
        >
          <span
            aria-hidden
            className="size-3 rounded-full"
            style={{ background: category.color }}
          />
          {category.name}
          {category.shortcut ? (
            <kbd className="ml-auto text-xs text-neutral-500">{category.shortcut}</kbd>
          ) : null}
        </button>
      ))}
    </div>
  );
}
