import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite outputs to ../static/dist so the Python server can serve the bundle
// alongside the legacy vanilla JS. The aiohttp app already has
//   web.static('/static', .../static)
// so /static/dist/index-*.js etc. is served automatically.
export default defineConfig({
  plugins: [react()],
  // base sets the public asset prefix used inside the generated index.html.
  // The Python server serves `/static/dist/*`, so anything Vite emits is
  // requested as `/static/dist/<file>`.
  base: "/static/dist/",
  build: {
    // outDir is resolved relative to the config file's location (web/),
    // so this points at aedi-sight-gui/static/dist/.
    outDir: "../static/dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8088",
      "/ws":  { target: "ws://127.0.0.1:8088", ws: true },
    },
  },
});
