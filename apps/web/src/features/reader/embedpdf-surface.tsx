"use client";

import { localEngine } from "@embedpdf/engine";
import { interactionPlugin } from "@embedpdf/react/interaction";
import { RenderLayer, renderPlugin } from "@embedpdf/react/render";
import { DocumentGate, Viewer } from "@embedpdf/react/runtime";
import { SelectionLayer, selectionPlugin } from "@embedpdf/react/selection";
import { Stage, stagePlugin, useStage, useStageState } from "@embedpdf/react/stage";
import { useEffect, useRef, type MutableRefObject } from "react";
import type { SurfaceControls, SurfaceProps, SurfaceState } from "./reader-surface";

/**
 * The EmbedPDF adapter of the reader surface (ADR 0024, 0040). Only the plugins ADR 0040 allows: it
 * never registers the actions, form or JavaScript plugins, so a PDF's JavaScript never runs.
 */
const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const PAGE_STEP = 0.9;
const ARROW_STEP = 60;

/** Lives inside a ready document: reports the view to the page and gives it the controls. */
function Bridge({
  onState,
  controlsRef,
  areaRef,
}: {
  onState: (state: SurfaceState) => void;
  controlsRef: MutableRefObject<SurfaceControls | null>;
  areaRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const stage = useStage();
  const view = useStageState();

  useEffect(() => {
    controlsRef.current = {
      goToPage: (page) => stage.goToPage(page - 1),
      zoomIn: () => stage.zoomIn(),
      zoomOut: () => stage.zoomOut(),
      fitWidth: () => stage.fitWidth(),
    };
  }, [stage, controlsRef]);

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

function Failed({ onState }: { onState: (state: SurfaceState) => void }) {
  useEffect(() => onState({ status: "error" }), [onState]);
  return null;
}

export default function EmbedPdfSurface({ source, onState, controlsRef }: SurfaceProps) {
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
          <Bridge onState={onState} controlsRef={controlsRef} areaRef={areaRef} />
          <Stage style={{ height: "100%" }}>
            {() => (
              <>
                <RenderLayer />
                <SelectionLayer />
              </>
            )}
          </Stage>
        </DocumentGate>
      </div>
    </Viewer>
  );
}
