import { defineConfig } from "vite";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: { port: 5199, strictPort: true },
  optimizeDeps: { exclude: ["@embedpdf/engine", "@embedpdf/engine-runtime-wasm32"] },
});
