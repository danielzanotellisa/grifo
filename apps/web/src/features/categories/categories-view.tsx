"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Result } from "../../lib/api";
import type { Category } from "../reader/highlights-client";
import {
  createCategory,
  editCategory,
  loadCategories,
  moveCategory,
  removeCategory,
  type CategoryDraft,
  type CategoryRole,
} from "./categories-client";
import { useCategoryFailureMessage } from "./use-category-failure-message";
import { buttonPrimary, buttonSecondary } from "../../components/styles";

const ROLES: CategoryRole[] = ["TOPIC", "DEFINITION", "ITEM", "IGNORE"];
const SHORTCUTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const NAME_MAX = 40;
const EMPTY: CategoryDraft = { name: "", color: "#4f8ef7", role: "ITEM", shortcut: null };

type Editing = { id: string; draft: CategoryDraft };
type Moving = { id: string; target: string };

/** Managing the categories of the palette (`category/screens`). */
export function CategoriesView() {
  const t = useTranslations("Categories");
  const failureMessage = useCategoryFailureMessage();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function refresh(): Promise<void> {
    const result = await loadCategories();
    if (result.ok) setCategories(result.value);
    else if (categories === null) {
      const message = failureMessage(result);
      setError(message ? `${t("errors.loadFailed")} ${message}` : null);
      setCategories([]);
    }
  }
  useEffect(() => {
    void refresh();
    // The first load runs once.
  }, []);

  /** One change at a time; the list is pulled again whatever the answer. */
  async function run(
    action: () => Promise<Result<null>> | null,
    onFailure?: (code: string) => boolean,
  ): Promise<boolean> {
    if (busy.current) return false;
    const started = action();
    if (started === null) return false;
    busy.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await started;
    if (!result.ok && !onFailure?.(result.code)) {
      const message = failureMessage(result);
      if (message) setError(message);
    }
    await refresh();
    setPending(false);
    busy.current = false;
    return result.ok;
  }

  const invalidName = (name: string) => name.trim().length < 1 || name.trim().length > NAME_MAX;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (invalidName(draft.name)) return setError(t("errors.nameInvalid"));
    if (await run(() => createCategory(draft, categories ?? []))) setDraft(EMPTY);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const original = categories?.find((c) => c.id === editing.id);
    if (!original) return;
    if (invalidName(editing.draft.name)) return setError(t("errors.nameInvalid"));
    if (await run(() => editCategory(original, editing.draft))) setEditing(null);
  }

  async function onDelete(category: Category) {
    await run(
      () => removeCategory(category.id),
      (code) => {
        if (code !== "CATEGORY_IN_USE") return false;
        const first = categories?.find((c) => c.id !== category.id);
        setMoving({ id: category.id, target: first?.id ?? "" });
        return true;
      },
    ).then((ok) => {
      if (ok) setNotice(t("movedToTrash", { name: category.name }));
    });
  }

  async function onMoveAndDelete(category: Category) {
    if (!moving || moving.target === "") return;
    if (await run(() => removeCategory(category.id, moving.target))) {
      setMoving(null);
      setNotice(t("movedToTrash", { name: category.name }));
    }
  }

  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setEditing(null);
      setError(null);
    }
  };

  const fields = (
    value: CategoryDraft,
    change: (next: CategoryDraft) => void,
    labels: { name: string; color: string; role: string; shortcut: string },
    autoFocus: boolean,
  ) => (
    <>
      <input
        aria-label={labels.name}
        value={value.name}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(event) => change({ ...value, name: event.target.value })}
        onKeyDown={escape}
        className="min-w-40 flex-1 rounded-md border border-divider px-2 py-1"
      />
      <input
        type="color"
        aria-label={labels.color}
        value={value.color}
        onChange={(event) => change({ ...value, color: event.target.value })}
        className="h-8 w-10 rounded-md border border-divider"
      />
      <select
        aria-label={labels.role}
        value={value.role}
        onChange={(event) => change({ ...value, role: event.target.value as CategoryRole })}
        className={buttonSecondary}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {t(`roles.${role}`)}
          </option>
        ))}
      </select>
      <select
        aria-label={labels.shortcut}
        value={value.shortcut ?? ""}
        onChange={(event) =>
          change({
            ...value,
            shortcut: event.target.value === "" ? null : Number(event.target.value),
          })
        }
        className={buttonSecondary}
      >
        <option value="">{t("noShortcut")}</option>
        {SHORTCUTS.map((digit) => (
          <option key={digit} value={digit}>
            {digit}
          </option>
        ))}
      </select>
    </>
  );

  if (categories === null) return <p className="text-ink-muted">{t("loading")}</p>;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink-black">
        {t("title")}
      </h1>

      <form
        onSubmit={(event) => void onCreate(event)}
        noValidate
        className="flex flex-wrap items-center gap-2"
      >
        {fields(
          draft,
          setDraft,
          {
            name: t("newName"),
            color: t("newColor"),
            role: t("newRole"),
            shortcut: t("newShortcut"),
          },
          false,
        )}
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {t("create")}
        </button>
      </form>

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

      {categories.length === 0 ? (
        <p className="text-ink-muted">{t("empty")}</p>
      ) : (
        <ul
          aria-label={t("list")}
          className="flex flex-col divide-y divide-hairline rounded-md border border-hairline"
        >
          {categories.map((category, index) => (
            <li key={category.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              {editing?.id === category.id ? (
                <form
                  onSubmit={(event) => void onSave(event)}
                  noValidate
                  className="flex flex-1 flex-wrap items-center gap-2"
                >
                  {fields(
                    editing.draft,
                    (next) => setEditing({ id: category.id, draft: next }),
                    {
                      name: t("name"),
                      color: t("color"),
                      role: t("role"),
                      shortcut: t("shortcut"),
                    },
                    true,
                  )}
                  <button type="submit" disabled={pending} className={buttonPrimary}>
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
                </form>
              ) : (
                <>
                  <span
                    aria-hidden
                    data-color={category.color}
                    className="size-4 shrink-0 rounded-full"
                    style={{ background: category.color }}
                  />
                  <span data-name className="font-medium">
                    {category.name}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {t(`roles.${category.role as CategoryRole}`)}
                  </span>
                  {category.shortcut ? (
                    <kbd className="rounded border border-divider px-1.5 text-xs">
                      {category.shortcut}
                    </kbd>
                  ) : null}
                  <span className="ml-auto flex flex-wrap items-center gap-2 text-sm">
                    <button
                      type="button"
                      aria-label={t("moveUp", { name: category.name })}
                      disabled={pending || index === 0}
                      onClick={() => void run(() => moveCategory(categories, category.id, -1))}
                      className="underline disabled:opacity-40 disabled:no-underline"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t("moveDown", { name: category.name })}
                      disabled={pending || index === categories.length - 1}
                      onClick={() => void run(() => moveCategory(categories, category.id, 1))}
                      className="underline disabled:opacity-40 disabled:no-underline"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={t("edit", { name: category.name })}
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        setEditing({
                          id: category.id,
                          draft: {
                            name: category.name,
                            color: category.color,
                            role: category.role as CategoryRole,
                            shortcut: category.shortcut,
                          },
                        });
                      }}
                      className="underline"
                    >
                      {t("editLabel")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("delete", { name: category.name })}
                      disabled={pending}
                      onClick={() => void onDelete(category)}
                      className="underline"
                    >
                      {t("deleteLabel")}
                    </button>
                  </span>
                  {moving?.id === category.id ? (
                    <div className="flex basis-full flex-wrap items-center gap-2 text-sm">
                      <label htmlFor={`move-${category.id}`}>{t("moveTo")}</label>
                      <select
                        id={`move-${category.id}`}
                        value={moving.target}
                        onChange={(event) =>
                          setMoving({ id: category.id, target: event.target.value })
                        }
                        className={buttonSecondary}
                      >
                        {categories
                          .filter((c) => c.id !== category.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void onMoveAndDelete(category)}
                        className={buttonPrimary}
                      >
                        {t("moveAndDelete")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMoving(null)}
                        className={buttonSecondary}
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
