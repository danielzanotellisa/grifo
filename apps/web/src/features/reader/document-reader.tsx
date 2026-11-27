"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { pullAll, request, type Failure } from "../../lib/api";
import type { DocumentItem } from "../documents/documents-client";
import type { Surface, SurfaceControls, SurfaceState } from "./reader-surface";

type Phase =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "notReady"; doc: DocumentItem }
  | { kind: "failed"; failure: Failure; doc: DocumentItem }
  | { kind: "ready"; doc: DocumentItem; url: string };

/** The reader page: finds the document, asks for its file and hands it to the engine surface (`document/reader`). */
export function DocumentReader({ documentId, Surface }: { documentId: string; Surface: Surface }) {
  const t = useTranslations("Reader");
  const errors = useTranslations("Reader.errors");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [surface, setSurface] = useState<SurfaceState>({ status: "loading" });
  const [typedPage, setTypedPage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const controls = useRef<SurfaceControls | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pulled = await pullAll();
      if (cancelled) return;
      if (!pulled.ok) {
        if (pulled.code === "UNAUTHENTICATED") router.push("/login");
        else setPhase({ kind: "failed", failure: pulled, doc: placeholder(documentId) });
        return;
      }
      const doc = pulled.value
        .filter((c) => c.entity === "document" && c.op === "upsert")
        .map((c) => c.data as DocumentItem)
        .find((d) => d.id === documentId);
      if (!doc) return setPhase({ kind: "notFound" });
      if (doc.status !== "READY") return setPhase({ kind: "notReady", doc });

      const file = await request(`/api/documents/${documentId}/file`);
      if (cancelled) return;
      if (!file.ok) {
        if (file.code === "UNAUTHENTICATED") router.push("/login");
        else if (file.code === "NOT_FOUND") setPhase({ kind: "notFound" });
        else if (file.code === "DOCUMENT_NOT_READY") setPhase({ kind: "notReady", doc });
        else setPhase({ kind: "failed", failure: file, doc });
        return;
      }
      const { url } = (await file.value.json()) as { url: string };
      setPhase({ kind: "ready", doc, url });
    })();
    return () => {
      cancelled = true;
    };
    // The document id does not change while the page is open.
  }, []);

  const isReady = surface.status === "ready";
  useEffect(() => {
    if (!isReady) return;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      )
        return;
      if (event.key === "+" || event.key === "=") controls.current?.zoomIn();
      else if (event.key === "-") controls.current?.zoomOut();
      else if (event.key === "0") controls.current?.fitWidth();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isReady]);

  const source = (url: string) => async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The file answered ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };

  function goToTyped(event: FormEvent) {
    event.preventDefault();
    if (surface.status !== "ready") return;
    const valid = typedPage !== null ? /^\d+$/.test(typedPage.trim()) : true;
    const page = typedPage === null ? surface.currentPage : Number(typedPage.trim());
    if (!valid || page < 1 || page > surface.pageCount) {
      setPageError(t("invalidPage", { total: surface.pageCount }));
      return;
    }
    setPageError(null);
    setTypedPage(null);
    controls.current?.goToPage(page);
  }

  const failureText = (failure: Failure): string => {
    switch (failure.code) {
      case "RATE_LIMITED":
        return failure.retryAfterSeconds
          ? errors("rateLimited", { seconds: failure.retryAfterSeconds })
          : errors("rateLimitedNoTime");
      case "NETWORK":
        return errors("network");
      default:
        return errors("generic");
    }
  };

  const message = (text: string, back: { href: string; label: string }) => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-8">
      <p>{text}</p>
      <Link href={back.href} className="underline">
        {back.label}
      </Link>
    </main>
  );
  const toSubjects = { href: "/", label: t("backToSubjects") };
  const toSubject = (doc: DocumentItem) =>
    doc.subjectId ? { href: `/subjects/${doc.subjectId}`, label: t("backToSubject") } : toSubjects;

  if (phase.kind === "loading") return <p className="p-8 text-neutral-500">{t("loading")}</p>;
  if (phase.kind === "notFound") return message(t("notFound"), toSubjects);
  if (phase.kind === "notReady") {
    const text =
      phase.doc.status === "REJECTED"
        ? t("rejected")
        : phase.doc.status === "QUARANTINED"
          ? t("quarantined")
          : t("notReady");
    return message(text, toSubject(phase.doc));
  }
  if (phase.kind === "failed") return message(failureText(phase.failure), toSubject(phase.doc));
  if (surface.status === "error") return message(t("cannotOpen"), toSubject(phase.doc));

  const state = surface.status === "ready" ? surface : null;
  const button =
    "rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-neutral-900 disabled:opacity-40";
  return (
    <div className="flex h-screen flex-col">
      <div
        role="toolbar"
        aria-label={phase.doc.title}
        className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2"
      >
        <Link href={toSubject(phase.doc).href} className="text-sm text-neutral-600 underline">
          {t("backToSubject")}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{phase.doc.title}</h1>
        {state ? (
          <>
            <button
              type="button"
              aria-label={t("previous")}
              disabled={state.currentPage <= 1}
              onClick={() => controls.current?.goToPage(state.currentPage - 1)}
              className={button}
            >
              ‹
            </button>
            <form onSubmit={goToTyped} className="flex items-center gap-2" noValidate>
              <label htmlFor="go-to-page" className="sr-only">
                {t("goTo")}
              </label>
              <input
                id="go-to-page"
                inputMode="numeric"
                autoComplete="off"
                value={typedPage ?? String(state.currentPage)}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setTypedPage(event.target.value)}
                onBlur={() => {
                  setTypedPage(null);
                  setPageError(null);
                }}
                className="w-14 rounded-md border border-neutral-300 px-2 py-1 text-center text-sm"
              />
              <span className="text-sm text-neutral-600">
                {t("page", { page: state.currentPage, total: state.pageCount })}
              </span>
            </form>
            <button
              type="button"
              aria-label={t("next")}
              disabled={state.currentPage >= state.pageCount}
              onClick={() => controls.current?.goToPage(state.currentPage + 1)}
              className={button}
            >
              ›
            </button>
            <button
              type="button"
              aria-label={t("zoomOut")}
              disabled={!state.canZoomOut}
              onClick={() => controls.current?.zoomOut()}
              className={button}
            >
              −
            </button>
            <span className="w-12 text-center text-sm tabular-nums">
              {t("zoomLevel", { percent: Math.round(state.zoom * 100) })}
            </span>
            <button
              type="button"
              aria-label={t("zoomIn")}
              disabled={!state.canZoomIn}
              onClick={() => controls.current?.zoomIn()}
              className={button}
            >
              +
            </button>
            <button
              type="button"
              aria-label={t("fitWidth")}
              onClick={() => controls.current?.fitWidth()}
              className={button}
            >
              ↔
            </button>
          </>
        ) : null}
      </div>
      {pageError ? (
        <p role="alert" className="px-4 py-1 text-sm text-red-700">
          {pageError}
        </p>
      ) : null}
      {surface.status === "loading" ? (
        <p className="px-4 py-2 text-sm text-neutral-500">{t("loading")}</p>
      ) : null}
      <div className="min-h-0 flex-1">
        <Surface source={source(phase.url)} onState={setSurface} controlsRef={controls} />
      </div>
    </div>
  );
}

const placeholder = (id: string): DocumentItem => ({
  id,
  subjectId: "",
  title: "",
  status: "READY",
  pageCount: null,
  rejectCode: null,
});
