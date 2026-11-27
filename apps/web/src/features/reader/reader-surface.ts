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

/** A rectangle in PDF points, origin bottom-left, as the server stores it (ADR 0004, 0040). */
export type PdfPageRect = { x1: number; y1: number; x2: number; y2: number };

/** What the person selected, page by page. The rects are already in bottom-left PDF points. */
export type SelectionInfo = {
  pages: {
    pageIndex: number;
    rects: PdfPageRect[];
    exact: string;
    prefix: string;
    suffix: string;
  }[];
  /** Where to open the menu, in pixels from the top-left of the surface. */
  anchor: { x: number; y: number };
};

/** A highlight to draw over its page. */
export type SurfaceHighlight = {
  id: string;
  pageIndex: number;
  rects: PdfPageRect[];
  color: string;
};

export type SurfaceControls = {
  /** 1-based. */
  goToPage(page: number): void;
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
  clearSelection(): void;
};

export type SurfaceProps = {
  /** Fetches the bytes of the document. */
  source: () => Promise<Uint8Array>;
  onState: (state: SurfaceState) => void;
  controlsRef: MutableRefObject<SurfaceControls | null>;
  highlights: SurfaceHighlight[];
  /** Called with the selection when the person finishes selecting, and with null when it is gone. */
  onSelection: (selection: SelectionInfo | null) => void;
};

export type Surface = ComponentType<SurfaceProps>;
