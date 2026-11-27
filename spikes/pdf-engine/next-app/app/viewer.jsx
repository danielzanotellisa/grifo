"use client";
import { Viewer, DocumentGate } from "@embedpdf/react/runtime";
import { Stage, stagePlugin, StageToken } from "@embedpdf/react/stage";
import { RenderLayer, renderPlugin } from "@embedpdf/react/render";
import { interactionPlugin } from "@embedpdf/react/interaction";
import { SelectionLayer, selectionPlugin, SelectionToken } from "@embedpdf/react/selection";
import { searchPlugin, SearchToken } from "@embedpdf/react/search";
import { AnnotationLayer, annotationPlugin, AnnotationToken } from "@embedpdf/react/annotation";
import { localEngine } from "@embedpdf/engine";

const name = typeof location === "undefined" ? "two-column" : (new URLSearchParams(location.search).get("pdf") ?? "two-column");
const engine = typeof window === "undefined" ? null : localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin(), annotationPlugin(), searchPlugin()];
window.__tokens = { SelectionToken, StageToken, AnnotationToken, SearchToken };
window.__t0 = performance.now();

const source = async () => {
  const bytes = new Uint8Array(await (await fetch(`/fixtures/${name}.pdf`)).arrayBuffer());
  return { kind: "bytes", id: "doc", bytes };
};

export default function ViewerPage() {
  return (
  <Viewer
    engine={engine}
    plugins={plugins}
    initialDocuments={[{ source }]}
    onReady={(kernel) => { window.__kernel = kernel; }}
    renderError={(e) => <pre id="boot-error">{String(e?.stack ?? e)}</pre>}
  >
    <div style={{ height: "100%" }}>
      <DocumentGate fallback={<p>Loading…</p>}>
        <Stage style={{ height: "100%" }}>
          {() => (<><RenderLayer /><SelectionLayer /><AnnotationLayer /></>)}
        </Stage>
      </DocumentGate>
    </div>
  </Viewer>
  );
}
