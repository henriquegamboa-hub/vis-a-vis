import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error JS helper alongside the TS vite config
import { publishPagesShell } from "./scripts/pages-shell.mjs";

/**
 * GitHub Pages project sites are served under `/<repo>/`. Vite wants a trailing
 * slash. An empty BASE_PATH (user site or custom domain) stays at the origin.
 */
function pagesBasePath(): string {
  const raw = process.env.BASE_PATH === undefined ? "/vis-a-vis/" : process.env.BASE_PATH.trim();
  if (raw === "" || raw === "/") return "/";
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

// `--mode pages` emits a static client (`dist/client`) for GitHub Pages.
// Every production build is prerendered HTML. There is no server deploy.
export default defineConfig(({ command, mode }) => {
  if (mode === "pages") process.env.PAGES = "true";
  const isPages = process.env.PAGES === "true";

  return {
    base: isPages ? pagesBasePath() : "/",
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
    },
    preview: {
      host: "127.0.0.1",
      port: 8081,
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    optimizeDeps: {
      exclude: ["@huggingface/transformers", "onnxruntime-web"],
    },
    ssr: {
      external: ["@huggingface/transformers", "onnxruntime-node", "onnxruntime-web", "sharp"],
    },
    plugins: [
      tailwindcss(),
      tanstackStart(
        command === "build"
          ? {
              // Static HTML only. publishPagesShell copies index.html to 404.html
              // for GitHub Pages.
              prerender: {
                enabled: true,
                crawlLinks: false,
                autoStaticPathsDiscovery: true,
                ...(isPages ? { onSuccess: () => publishPagesShell() } : {}),
              },
            }
          : {},
      ),
      viteReact(),
    ],
  };
});
