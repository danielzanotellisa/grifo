"use client";

import { localEngine } from "@embedpdf/engine";
import { interactionPlugin } from "@embedpdf/react/interaction";
import { RenderLayer, renderPlugin } from "@embedpdf/react/render";
import {
  DocumentGate,
  Viewer,
  useCapability,
  useCapabilityEvent,
  type PageContextValue,
  type PageRef,
} from "@embedpdf/react/runtime";
import { SelectionLayer, SelectionToken, selectionPlugin } from "@embedpdf/react/selection";
import { Stage, stagePlugin, useStage, useStageEvent, useStageState } from "@embedpdf/react/stage";
import { useEffect, useRef, type MutableRefObject } from "react";
import { toPdfRect, toTopLeftBox, type TopLeftBox } from "./geometry";
import type {
  SelectionInfo,
  SurfaceControls,
  SurfaceHighlight,
  SurfaceProps,
  SurfaceState,
} from "./reader-surface";

/**
 * The EmbedPDF adapter of the reader surface (ADR 0024, 0040). Only the plugins ADR 0040 allows: it
 * never registers the actions, form or JavaScript plugins, so a PDF's JavaScript never runs.
 */
const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const CONTEXT_CHARS = 32;
const PAGE_STEP = 0.9;
const ARROW_STEP = 60;

/** Lives inside a ready document: reports the view to the page and gives it the controls. */
function Bridge({
  onState,
  onSelection,
  controlsRef,
  areaRef,
}: {
  onState: (state: SurfaceState) => void;
  onSelection: (selection: SelectionInfo | null) => void;
  controlsRef: MutableRefObject<SurfaceControls | null>;
  areaRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const stage = useStage();
  const view = useStageState();
  const selection = useCapability(SelectionToken);
  // Where the selection ends, to place its menu again when the view moves.
  const menuTarget = useRef<{ page: PageRef; box: TopLeftBox } | null>(null);
  const reported = useRef<SelectionInfo | null>(null);

  const anchorOf = (page: PageRef, box: TopLeftBox) => {
    const at = stage.pageRectToViewport(page, box);
    return at ? { x: at.x + at.width / 2, y: at.y + at.height + 8 } : null;
  };

  /** What the person selected, page by page, in bottom-left PDF points (ADR 0040). */
  async function describe(): Promise<SelectionInfo | null> {
    const range = selection.getRange();
    const refs = selection.listSelectedPages();
    if (!range || refs.length === 0) return null;

    const pages: SelectionInfo["pages"] = [];
    let target: { page: PageRef; box: TopLeftBox } | null = null;
    for (const [i, page] of refs.entries()) {
      const box = stage.getPageBox(page);
      if (!box) continue;
      const height = box.height / box.contentScale;
      const segments = selection.listSegments(page);
      if (segments.length === 0) continue;

      const last = i === refs.length - 1;
      const start = i === 0 ? range.start.index : 0;
      const end = last ? range.end.index : 1_000_000;
      const read = (from: number, to: number) =>
        selection.readTextInRange({ start: { page, index: from }, end: { page, index: to } });
      pages.push({
        pageIndex: box.pageIndex,
        rects: segments.map((segment) => toPdfRect(segment.rect, height)),
        exact: await read(start, end),
        prefix: await read(Math.max(0, start - CONTEXT_CHARS), start),
        suffix: last ? await read(end, end + CONTEXT_CHARS) : "",
      });
      target = { page, box: segments[segments.length - 1]!.rect };
    }
    if (pages.length === 0 || !target) return null;

    const anchor = anchorOf(target.page, target.box);
    if (!anchor) return null;
    menuTarget.current = target;
    return { pages, anchor };
  }

  useCapabilityEvent(
    SelectionToken,
    (s) => s.onCommitted,
    () => {
      void describe().then((info) => {
        reported.current = info;
        onSelection(info);
      });
    },
  );
  useCapabilityEvent(
    SelectionToken,
    (s) => s.onCleared,
    () => {
      reported.current = null;
      menuTarget.current = null;
      onSelection(null);
    },
  );
  // The menu follows the selection when the view scrolls or zooms.
  useStageEvent(
    (s) => s.onCameraChanged,
    () => {
      const info = reported.current;
      const target = menuTarget.current;
      if (!info || !target) return;
      const anchor = anchorOf(target.page, target.box);
      if (!anchor) return;
      reported.current = { ...info, anchor };
      onSelection(reported.current);
    },
  );

  useEffect(() => {
    controlsRef.current = {
      goToPage: (page) => stage.goToPage(page - 1),
      zoomIn: () => stage.zoomIn(),
      zoomOut: () => stage.zoomOut(),
      fitWidth: () => stage.fitWidth(),
      clearSelection: () => selection.clear(),
    };
  }, [stage, selection, controlsRef]);

  useEffect(() => {
    onState({
      status: "ready",
      pageCount: view.pageCount,
      currentPage: view.currentPageIndex + 1,
      zoom: view.zoomLevel,
      canZoomIn: stage.canZoomIn(),
      canZoomOut: stage.canZoomOut(),
    });
  }, [view.pageCount, view.currentPageIndex, view.zoomLevel, stage, onState]);

  // The area is focusable: the keys that scroll a document scroll this one.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const height = stage.getViewportSize().height;
      const keys: Record<string, () => void> = {
        ArrowDown: () => stage.panBy(0, -ARROW_STEP),
        ArrowUp: () => stage.panBy(0, ARROW_STEP),
        PageDown: () => stage.panBy(0, -height * PAGE_STEP),
        PageUp: () => stage.panBy(0, height * PAGE_STEP),
        Home: () => stage.goToFirstPage(),
        End: () => stage.goToLastPage(),
      };
      const action = keys[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    area.addEventListener("keydown", onKey);
    return () => area.removeEventListener("keydown", onKey);
  }, [stage, areaRef]);

  return null;
}

/** The highlights of one page, drawn from their stored rects through the page transform, so zoom keeps them aligned. */
function HighlightLayer({
  page,
  highlights,
}: {
  page: PageContextValue;
  highlights: SurfaceHighlight[];
}) {
  const stage = useStage();
  const box = stage.getPageBox(page.pageIndex);
  const own = highlights.filter((h) => h.pageIndex === page.pageIndex);
  if (!box || own.length === 0) return null;

  const height = box.height / box.contentScale;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {own.flatMap((highlight) =>
        highlight.rects.map((rect, i) => {
          const at = page.transform.pageToViewRect(toTopLeftBox(rect, height));
          return (
            <div
              key={`${highlight.id}-${i}`}
              data-highlight={highlight.id}
              style={{
                position: "absolute",
                left: at.x,
                top: at.y,
                width: at.width,
                height: at.height,
                background: highlight.color,
                opacity: 0.4,
                mixBlendMode: "multiply",
              }}
            />
          );
        }),
      )}
    </div>
  );
}

function Failed({ onState }: { onState: (state: SurfaceState) => void }) {
  useEffect(() => onState({ status: "error" }), [onState]);
  return null;
}

export default function EmbedPdfSurface({
  source,
  onState,
  controlsRef,
  highlights,
  onSelection,
}: SurfaceProps) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[
        { source: async () => ({ kind: "bytes", id: "document", bytes: await source() }) },
      ]}
      renderError={() => <Failed onState={onState} />}
    >
      <div
        ref={areaRef}
        tabIndex={0}
        className="h-full outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        <DocumentGate
          error={() => <Failed onState={onState} />}
          locked={() => <Failed onState={onState} />}
        >
          <Bridge
            onState={onState}
            onSelection={onSelection}
            controlsRef={controlsRef}
            areaRef={areaRef}
          />
          <Stage style={{ height: "100%" }}>
            {(page) => (
              <>
                <RenderLayer />
                <HighlightLayer page={page} highlights={highlights} />
                <SelectionLayer />
              </>
            )}
          </Stage>
        </DocumentGate>
      </div>
    </Viewer>
  );
}
