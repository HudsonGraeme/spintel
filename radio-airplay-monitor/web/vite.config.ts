import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from a GitHub Pages project subpath (https://<user>.github.io/airmon/),
// so asset + data URLs are prefixed with the repo name. Change to "/" for a root
// deploy (Cloudflare Pages or a custom domain).
const base = "/airmon/";

export default defineConfig({
  base,
  plugins: [react()],
  // Pin PostCSS to an empty inline config so Vite does NOT walk up the tree and
  // inherit the parent repo's Tailwind postcss.config.js. Chakra is CSS-in-JS.
  css: { postcss: {} },
  // Emit the production build to repo-root /docs so GitHub Pages can serve it
  // from the main branch ("/docs" folder).
  build: { outDir: "../../docs", emptyOutDir: true },
});
