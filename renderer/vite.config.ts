import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// herdr-bot renderer: built output is loaded by the desktop main process with `loadFile(...index.html)`
// (a file:// URL, not served from a root), so every asset reference must be relative -- `base: "./"`.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
