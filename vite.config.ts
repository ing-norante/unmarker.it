import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { legalPages, renderLegalPage } from "./scripts/legal-pages.ts";

const emptyNodeModule = path.resolve(
  import.meta.dirname,
  "./src/shims/emptyNodeModule.ts",
);

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "legal-pages",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const pathname = new URL(req.url || "/", "http://localhost").pathname;
          const match = /^\/legal\/([a-z-]+)\/?$/.exec(pathname);
          if (!match) return next();
          try {
            const html = await renderLegalPage(match[1], [
              "/src/index.css?direct",
            ]);
            if (!html) return next();
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("X-Robots-Tag", "noindex, follow");
            res.end(html);
          } catch (error) {
            next(error);
          }
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = new URL(req.url || "/", "http://localhost");
          const page = legalPages.find((page) =>
            [`/legal/${page.slug}`, `/legal/${page.slug}/`].includes(
              url.pathname,
            ),
          );
          if (page) req.url = `/legal/${page.slug}/index.html${url.search}`;
          next();
        });
      },
    },
  ],
  server: {
    proxy: {
      "/api/sponsors": "http://127.0.0.1:5174",
    },
  },
  // Match the dev worker format to production so an ESM worker loads the same
  // way in both. The client creates it with { type: "module" }.
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // OpenCV's universal bundle statically references these in its
      // unreachable Node-only branch. Browser builds intentionally shim them.
      crypto: emptyNodeModule,
      fs: emptyNodeModule,
      path: emptyNodeModule,
    },
  },
});
