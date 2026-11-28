import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Self-hosted container (ADR 0019, 0022). Not built for serverless: SSE and LISTEN/NOTIFY need long-lived processes.
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  // The PDF engine is a native addon that only the worker runs (`export/annotated-pdf`): it stays out of the bundle.
  serverExternalPackages: ["@embedpdf/engine", "@embedpdf/engine-runtime"],
  transpilePackages: [
    "@app/platform",
    "@app/identity",
    "@app/library",
    "@app/annotation",
    "@app/outline",
    "@app/study",
    "@app/export",
  ],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
