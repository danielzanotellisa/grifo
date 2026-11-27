"use client";

import dynamic from "next/dynamic";
import { DocumentReader } from "./document-reader";

/** The engine needs the browser (WebAssembly and workers), so its surface is loaded on the client only. */
const EmbedPdfSurface = dynamic(() => import("./embedpdf-surface"), { ssr: false });

export function ReaderPage({ documentId }: { documentId: string }) {
  return <DocumentReader documentId={documentId} Surface={EmbedPdfSurface} />;
}
