import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the /docs folder on the custom domain https://spintel.ca/,
// so the site lives at the root. (Before the custom domain this was "/airmon/"
// to carry the repo-name prefix on <user>.github.io.)
const base = "/";

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
