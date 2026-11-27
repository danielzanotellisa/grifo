"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Result } from "../../lib/api";
import { loadOutline, newFreeText, removeNode, saveNode, type OutlineData } from "./outline-client";
import {
  flatten,
  indent,
  moveAmongSiblings,
  outdent,
  positionAfter,
  type NodeData,
  type OutlineRole,
} from "./outline-tree";
import { useOutlineFailureMessage } from "./use-outline-failure-message";

const ROLES: OutlineRole[] = ["TOPIC", "DEFINITION", "ITEM"];
type Editing = { id: string; text: string; role: string };

/** The summary of a document as a tree that is changed with the keyboard (`outline-node/screens`). */
export function OutlineView({ documentId }: { documentId: string }) {
  const t = useTranslations("Outline");
  const failureMessage = useOutlineFailureMessage();
  const [data, setData] = useState<OutlineData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [addRole, setAddRole] = useState<OutlineRole>("ITEM");
  const [addText, setAddText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function refresh(): Promise<void> {
    const result = await loadOutline(documentId);
    if (result.ok) setData(result.value);
    else if (data === null) {
      const message = failureMessage(result);
      setError(message ? `${t("errors.loadFailed")} ${message}` : null);
      setData({ document: null, categories: [], highlights: [], nodes: [] });
    }
  }
  useEffect(() => {
    void refresh();
    // The first load runs once; the page does not change document while it is open.
  }, []);

  const roleOf = (node: NodeData): OutlineRole | null => {
    if (node.role) return node.role;
    const highlight = data?.highlights.find((h) => h.id === node.highlightId);
    const role = data?.categories.find((c) => c.id === highlight?.categoryId)?.role;
    return role === "TOPIC" || role === "DEFINITION" || role === "ITEM" ? role : null;
  };
  const quoteOf = (node: NodeData) => data?.highlights.find((h) => h.id === node.highlightId);
  const textOf = (node: NodeData) => node.text ?? quoteOf(node)?.quote.exact ?? "";
  const colorOf = (node: NodeData) =>
    data?.categories.find((c) => c.id === quoteOf(node)?.categoryId)?.color;

  const rows = data ? flatten(data.nodes, roleOf) : [];

  /** One change at a time; the tree is pulled again whatever the answer (`outline-node/screens`). */
  async function run(action: () => Promise<Result<null>>): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setError(null);
    const result = await action();
    let ok = true;
    if (!result.ok) {
      ok = false;
      const message = failureMessage(result);
      if (message) setError(message);
    }
    await refresh();
    busy.current = false;
    return ok;
  }

  function onTreeKey(event: KeyboardEvent) {
    if (editing || !data) return;
    const at = rows.findIndex((r) => r.node.id === selectedId);
    const handled = () => event.preventDefault();

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      handled();
      if (event.altKey) {
        const moved =
          selectedId && moveAmongSiblings(data.nodes, selectedId, event.key === "ArrowUp" ? -1 : 1);
        if (moved) void run(() => saveNode(moved));
        return;
      }
      const next = rows[at + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) setSelectedId(next.node.id);
      else if (at === -1 && rows[0]) setSelectedId(rows[0].node.id);
      return;
    }
    if (!selectedId) return;
    if (event.key === "Tab") {
      handled();
      const changed = event.shiftKey
        ? outdent(data.nodes, selectedId)
        : indent(data.nodes, selectedId);
      if (changed) void run(() => saveNode(changed));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      handled();
      void run(() => removeNode(selectedId)).then(() => setSelectedId(null));
    } else if (event.key === "Enter" || event.key === "F2") {
      handled();
      const node = data.nodes.find((n) => n.id === selectedId);
      if (node) setEditing({ id: node.id, text: textOf(node), role: node.role ?? "" });
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing || !data) return;
    const node = data.nodes.find((n) => n.id === editing.id);
    if (!node) return;
    const text = editing.text.trim();
    const role = (editing.role || null) as OutlineRole | null;
    const isHighlight = node.highlightId !== null;
    if (!isHighlight && (text === "" || role === null)) {
      setError(t("errors.textRequired"));
      return;
    }
    const saved = await run(() =>
      saveNode({ ...node, text: text === "" ? null : text, role: isHighlight ? role : role }),
    );
    if (saved) setEditing(null);
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    const text = addText.trim();
    if (text === "") {
      setError(t("errors.textRequired"));
      return;
    }
    const node = newFreeText(documentId, positionAfter(data.nodes, selectedId), addRole, text);
    if (await run(() => saveNode(node))) {
      setAddText("");
      setSelectedId(node.id);
    }
  }

  if (data === null) return <p className="text-neutral-500">{t("loading")}</p>;
  if (data.document === null) {
    return (
      <section className="flex flex-col gap-3">
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <p>{t("notFound")}</p>
        <Link href="/" className="underline">
          {t("back")}
        </Link>
      </section>
    );
  }
  if (data.document.status !== "READY") return <p>{t("notReady")}</p>;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/documents/${documentId}`} className="text-sm text-neutral-600 underline">
          {t("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("title")}: {data.document.title}
        </h1>
        <p className="text-sm text-neutral-500">{t("keys")}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-neutral-600">{t("empty")}</p>
      ) : (
        <ul
          role="tree"
          aria-label={t("tree", { title: data.document.title })}
          tabIndex={0}
          onKeyDown={onTreeKey}
          className="flex flex-col rounded-md border border-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          {rows.map(({ node, depth, topicLevel }) => {
            const role = roleOf(node);
            const color = colorOf(node);
            const selected = node.id === selectedId;
            return (
              <li
                key={node.id}
                role="treeitem"
                aria-level={depth}
                aria-selected={selected}
                data-node-id={node.id}
                onClick={() => setSelectedId(node.id)}
                style={{ paddingLeft: `${depth * 1.25}rem` }}
                className={`flex items-center gap-2 py-1.5 pr-3 ${selected ? "bg-neutral-100" : ""}`}
              >
                {color ? (
                  <span
                    aria-hidden
                    data-color={color}
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                ) : null}
                {editing?.id === node.id ? (
                  <form
                    onSubmit={(event) => void onSave(event)}
                    noValidate
                    className="flex flex-1 flex-wrap items-center gap-2"
                  >
                    <input
                      aria-label={t("editText")}
                      value={editing.text}
                      autoFocus
                      onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setEditing(null);
                          setError(null);
                        }
                      }}
                      className="min-w-48 flex-1 rounded-md border border-neutral-300 px-2 py-1"
                    />
                    <select
                      aria-label={t("editRole")}
                      value={editing.role}
                      onChange={(event) => setEditing({ ...editing, role: event.target.value })}
                      className="rounded-md border border-neutral-300 px-2 py-1"
                    >
                      {node.highlightId ? <option value="">{t("sameAsCategory")}</option> : null}
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md bg-neutral-900 px-3 py-1 text-sm text-white"
                    >
                      {t("save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setError(null);
                      }}
                      className="rounded-md border border-neutral-300 px-3 py-1 text-sm"
                    >
                      {t("cancel")}
                    </button>
                  </form>
                ) : role === "TOPIC" ? (
                  <span role="heading" aria-level={topicLevel} className="font-semibold">
                    {textOf(node)}
                  </span>
                ) : (
                  <>
                    {role === "DEFINITION" ? (
                      <span className="rounded bg-yellow-100 px-1.5 text-xs text-yellow-900">
                        {t("definition")}
                      </span>
                    ) : (
                      <span aria-hidden>•</span>
                    )}
                    <span>{textOf(node)}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(event) => void onAdd(event)}
        noValidate
        className="flex flex-wrap items-end gap-2"
      >
        <select
          aria-label={t("addRole")}
          value={addRole}
          onChange={(event) => setAddRole(event.target.value as OutlineRole)}
          className="rounded-md border border-neutral-300 px-2 py-2"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </select>
        <input
          aria-label={t("addText")}
          value={addText}
          onChange={(event) => setAddText(event.target.value)}
          autoComplete="off"
          className="min-w-60 flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
        >
          {t("add")}
        </button>
      </form>
    </section>
  );
}
