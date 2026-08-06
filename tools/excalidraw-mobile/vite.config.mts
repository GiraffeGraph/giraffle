import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
  build: {
    minify: true,
    target: "safari16",
    outDir: "../../apps/mobile/assets/excalidraw",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: "entry.tsx",
      formats: ["iife"],
      name: "GiraffleCanvas",
      fileName: () => "canvas.js",
    },
  },
});
