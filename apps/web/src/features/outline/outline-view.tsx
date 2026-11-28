"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Result } from "../../lib/api";
import { ExportButton } from "../exports/export-button";
import { createFlashcard } from "../flashcards/flashcards-client";
import { useFlashcardFailureMessage } from "../flashcards/use-flashcard-failure-message";
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
import { buttonPrimary, buttonSecondary } from "../../components/styles";

const ROLES: OutlineRole[] = ["TOPIC", "DEFINITION", "ITEM"];
type Editing = { id: string; text: string; role: string };
type Carding = { nodeId: string; front: string };

/** The summary of a document as a tree that is changed with the keyboard (`outline-node/screens`). */
export function OutlineView({ documentId }: { documentId: string }) {
  const t = useTranslations("Outline");
  const tCard = useTranslations("Flashcards");
  const tExport = useTranslations("Exports");
  const failureMessage = useOutlineFailureMessage();
  const cardFailureMessage = useFlashcardFailureMessage();
  const [data, setData] = useState<OutlineData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [carding, setCarding] = useState<Carding | null>(null);
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
      setData({ document: null, categories: [], highlights: [], nodes: [], flashcards: [] });
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

  const cardCount = (nodeId: string) =>
    data?.flashcards.filter((c) => c.sourceNodeId === nodeId).length ?? 0;

  const rows = data ? flatten(data.nodes, roleOf) : [];

  /** One change at a time; the tree is pulled again whatever the answer (`outline-node/screens`). */
  async function run(
    action: () => Promise<Result<null>>,
    messageOf = failureMessage,
  ): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setError(null);
    const result = await action();
    let ok = true;
    if (!result.ok) {
      ok = false;
      const message = messageOf(result);
      if (message) setError(message);
    }
    await refresh();
    busy.current = false;
    return ok;
  }

  function onTreeKey(event: KeyboardEvent) {
    if (editing || carding || !data) return;
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
    if (event.key === "c" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const node = data.nodes.find((n) => n.id === selectedId);
      if (node && roleOf(node) === "DEFINITION") {
        handled();
        setError(null);
        setCarding({ nodeId: node.id, front: "" });
      }
      return;
    }
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

  async function onCreateCard(event: FormEvent) {
    event.preventDefault();
    if (!carding) return;
    const front = carding.front.trim();
    if (front === "") {
      setError(tCard("errors.frontRequired"));
      return;
    }
    if (await run(() => createFlashcard(carding.nodeId, front), cardFailureMessage)) {
      setCarding(null);
    }
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

  if (data === null) return <p className="text-ink-muted">{t("loading")}</p>;
  if (data.document === null) {
    return (
      <section className="flex flex-col gap-3">
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <p>{t("notFound")}</p>
        <Link href="/" className="font-medium underline underline-offset-4">
          {t("back")}
        </Link>
      </section>
    );
  }
  if (data.document.status !== "READY") return <p>{t("notReady")}</p>;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/documents/${documentId}`} className="text-sm text-ink-muted underline">
          {t("back")}
        </Link>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink-black">
          {t("title")}: {data.document.title}
        </h1>
        <Link href={`/documents/${documentId}/flashcards`} className="text-sm underline">
          {tCard("title")}
        </Link>
        <p className="text-sm text-ink-muted">{t("keys")}</p>
        <ExportButton
          kind="SUMMARY_PDF"
          scope="DOCUMENT"
          scopeId={documentId}
          label={tExport("summaryDocumentLabel")}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-ink-muted">{t("empty")}</p>
      ) : (
        <ul
          role="tree"
          aria-label={t("tree", { title: data.document.title })}
          tabIndex={0}
          onKeyDown={onTreeKey}
          className="flex flex-col rounded-md border border-hairline outline-none focus-visible:ring-2 focus-visible:ring-ink"
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
                className={`flex flex-wrap items-center gap-2 py-1.5 pr-3 ${selected ? "bg-surface-container" : ""}`}
              >
                {color ? (
                  <span
                    aria-hidden
                    data-color={color}
                    className="size-2.5 shrink-0 rounded-full"
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
                      className="min-w-48 flex-1 rounded-md border border-divider px-2 py-1"
                    />
                    <select
                      aria-label={t("editRole")}
                      value={editing.role}
                      onChange={(event) => setEditing({ ...editing, role: event.target.value })}
                      className={buttonSecondary}
                    >
                      {node.highlightId ? <option value="">{t("sameAsCategory")}</option> : null}
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}`)}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={buttonPrimary}>
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
                ) : role === "TOPIC" ? (
                  <span
                    role="heading"
                    aria-level={topicLevel}
                    className="font-serif text-lg font-semibold text-ink-black"
                  >
                    {textOf(node)}
                  </span>
                ) : (
                  <>
                    {role === "DEFINITION" ? (
                      <span className="rounded-md bg-warning-container px-1.5 py-0.5 text-xs font-medium text-on-warning-container">
                        {t("definition")}
                      </span>
                    ) : (
                      <span aria-hidden>•</span>
                    )}
                    <span className={role === "DEFINITION" ? "font-serif text-base" : "text-sm"}>
                      {textOf(node)}
                    </span>
                  </>
                )}
                {editing?.id !== node.id && role === "DEFINITION" ? (
                  <span className="ml-auto flex items-center gap-2 text-sm">
                    {cardCount(node.id) > 0 ? (
                      <Link
                        href={`/documents/${documentId}/flashcards`}
                        className="font-medium underline underline-offset-4"
                      >
                        {tCard("count", { count: cardCount(node.id) })}
                      </Link>
                    ) : null}
                    {carding?.nodeId === node.id ? null : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(node.id);
                          setError(null);
                          setCarding({ nodeId: node.id, front: "" });
                        }}
                        className="font-medium underline underline-offset-4"
                      >
                        {tCard("create")}
                      </button>
                    )}
                  </span>
                ) : null}
                {carding?.nodeId === node.id ? (
                  <form
                    onSubmit={(event) => void onCreateCard(event)}
                    onClick={(event) => event.stopPropagation()}
                    noValidate
                    className="flex basis-full flex-wrap items-center gap-2"
                  >
                    <input
                      aria-label={tCard("frontField")}
                      value={carding.front}
                      autoFocus
                      onChange={(event) => setCarding({ ...carding, front: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setCarding(null);
                          setError(null);
                        }
                      }}
                      className="min-w-48 flex-1 rounded-md border border-divider px-2 py-1"
                    />
                    <button type="submit" className={buttonPrimary}>
                      {tCard("createSubmit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCarding(null);
                        setError(null);
                      }}
                      className={buttonSecondary}
                    >
                      {tCard("cancel")}
                    </button>
                  </form>
                ) : null}
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
          className={buttonSecondary}
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
          className="min-w-60 flex-1 rounded-md border border-divider px-3 py-2"
        />
        <button type="submit" className={buttonPrimary}>
          {t("add")}
        </button>
      </form>
    </section>
  );
}
