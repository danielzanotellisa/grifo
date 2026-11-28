"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/**
 * The line that says what just happened (`role="status"`), kept in the flow of the page: no modal,
 * nothing that covers what is being read (ADR 0043). With `onUndo` it also offers to undo the
 * delete it reports (`_cross-cutting/undo`).
 */
export function Notice({
  children,
  icon = "info",
  onUndo,
}: {
  children: ReactNode;
  icon?: IconName;
  onUndo?: (() => void) | undefined;
}) {
  const t = useTranslations("Undo");
  return (
    <p
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-hairline bg-surface-container px-4 py-2.5 text-sm text-ink"
    >
      <Icon name={icon} size={16} className="shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1">{children}</span>
      {onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="font-medium text-ink underline underline-offset-4 hover:text-ink-black"
        >
          {t("label")}
        </button>
      ) : null}
    </p>
  );
}
