import type { ComponentType, MutableRefObject } from "react";

/**
 * What the reader page needs from the PDF engine (ADR 0024, 0040). The EmbedPDF adapter implements
 * it, and the page logic is tested with a fake: only the adapter knows the engine.
 */
export type SurfaceState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      pageCount: number;
      /** 1-based. */
      currentPage: number;
      /** 1 = 100 %. */
      zoom: number;
      canZoomIn: boolean;
      canZoomOut: boolean;
    };

export type SurfaceControls = {
  /** 1-based. */
  goToPage(page: number): void;
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
};

export type SurfaceProps = {
  /** Fetches the bytes of the document. */
  source: () => Promise<Uint8Array>;
  onState: (state: SurfaceState) => void;
  controlsRef: MutableRefObject<SurfaceControls | null>;
};

export type Surface = ComponentType<SurfaceProps>;
