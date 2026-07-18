import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages is configured to deploy from the /docs folder as the site root, so
// the public URL is https://<user>.github.io/airmon/ and asset + data URLs carry
// the repo-name prefix. Use "/" for a root/custom-domain deploy.
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
