"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  createSubject,
  deleteSubject,
  loadSubjects,
  renameSubject,
  type Failure,
  type Result,
  type SubjectItem,
} from "./subjects-client";
import { useFailureMessage } from "./use-failure-message";

const NAME_MAX = 120;

export function SubjectsView() {
  const t = useTranslations("Subjects");
  const failureMessage = useFailureMessage("subjects");
  const [subjects, setSubjects] = useState<SubjectItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [focusAfter, setFocusAfter] = useState<string | null>(null);
  const busy = useRef(false);
  const newField = useRef<HTMLInputElement>(null);

  const showFailure = (failure: Failure) => setError(failureMessage(failure));

  async function refresh(): Promise<boolean> {
    const result = await loadSubjects();
    if (!result.ok) {
      showFailure(result);
      return false;
    }
    setSubjects(result.value);
    return true;
  }

  useEffect(() => {
    void (async () => {
      const result = await loadSubjects();
      if (result.ok) setSubjects(result.value);
      else {
        const message = failureMessage(result);
        setError(message ? `${t("errors.loadFailed")} ${message}` : null);
        setSubjects([]);
      }
    })();
    // The first load runs once; the messages do not change while the screen is open.
  }, []);

  useEffect(() => {
    if (focusAfter) document.getElementById(focusAfter)?.focus();
    setFocusAfter(null);
  }, [focusAfter, subjects]);

  /** Runs one action at a time; a second call while one is pending sends nothing. */
  async function run(key: string, action: () => Promise<Result<unknown>>, onDone: () => void) {
    if (busy.current) return;
    busy.current = true;
    setPending(key);
    setError(null);
    setNotice(null);
    const result = await action();
    if (result.ok) {
      if (await refresh()) onDone();
    } else {
      showFailure(result);
    }
    busy.current = false;
    setPending(null);
  }

  const invalidName = (name: string): string | null =>
    name.length < 1
      ? t("errors.nameRequired")
      : name.length > NAME_MAX
        ? t("errors.nameTooLong")
        : null;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    const invalid = invalidName(name);
    if (invalid) {
      setError(invalid);
      newField.current?.focus();
      return;
    }
    await run(
      "create",
      () => createSubject(name),
      () => setNewName(""),
    );
  }

  async function onRename(event: FormEvent) {
    event.preventDefault();
    if (!renaming) return;
    const name = renaming.value.trim();
    const invalid = invalidName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    const { id } = renaming;
    await run(
      `rename-${id}`,
      () => renameSubject(id, name),
      () => {
        setRenaming(null);
        setFocusAfter(`rename-${id}`);
      },
    );
  }

  async function onDelete(subject: SubjectItem) {
    await run(
      `delete-${subject.id}`,
      () => deleteSubject(subject.id),
      () => {
        setNotice(t("movedToTrash", { name: subject.name }));
        setFocusAfter("new-subject");
      },
    );
  }

  function onRenameKey(event: KeyboardEvent) {
    if (event.key === "Escape" && renaming) {
      setRenaming(null);
      setError(null);
      setFocusAfter(`rename-${renaming.id}`);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>

      <form onSubmit={onCreate} noValidate className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <label htmlFor="new-subject" className="text-sm font-medium">
            {t("newLabel")}
          </label>
          <input
            id="new-subject"
            ref={newField}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            autoComplete="off"
            className="rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20"
          />
        </div>
        <button
          type="submit"
          disabled={pending === "create"}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending === "create" ? t("creating") : t("create")}
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-neutral-700">
          {notice}
        </p>
      ) : null}

      {subjects === null ? (
        <p className="text-neutral-500">{t("loading")}</p>
      ) : subjects.length === 0 ? (
        <p className="text-neutral-600">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {subjects.map((subject) => (
            <li key={subject.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {renaming?.id === subject.id ? (
                <form
                  onSubmit={onRename}
                  noValidate
                  className="flex flex-1 flex-wrap items-center gap-2"
                >
                  <label htmlFor={`name-${subject.id}`} className="sr-only">
                    {t("renameLabel", { name: subject.name })}
                  </label>
                  <input
                    id={`name-${subject.id}`}
                    value={renaming.value}
                    autoFocus
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setRenaming({ id: subject.id, value: event.target.value })}
                    onKeyDown={onRenameKey}
                    autoComplete="off"
                    className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-1.5"
                  />
                  <button
                    type="submit"
                    disabled={pending === `rename-${subject.id}`}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                  >
                    {t("save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRenameKey({ key: "Escape" } as KeyboardEvent)}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    {t("cancel")}
                  </button>
                </form>
              ) : (
                <>
                  <span data-name className="flex-1 font-medium">
                    {subject.name}
                  </span>
                  <span className="text-sm text-neutral-500">
                    {t("documentCount", { count: subject.documentCount })}
                  </span>
                  <button
                    id={`rename-${subject.id}`}
                    type="button"
                    aria-label={t("rename", { name: subject.name })}
                    disabled={pending !== null}
                    onClick={() => {
                      setError(null);
                      setRenaming({ id: subject.id, value: subject.name });
                    }}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60"
                  >
                    {t("rename", { name: "" }).trim()}
                  </button>
                  <button
                    type="button"
                    aria-label={t("delete", { name: subject.name })}
                    disabled={pending !== null}
                    onClick={() => void onDelete(subject)}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                  >
                    {t("delete", { name: "" }).trim()}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
