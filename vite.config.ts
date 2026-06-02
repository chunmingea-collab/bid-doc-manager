import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    react(),
    electron([
      {
        // Main process
        entry: "src/main/index.ts",
        vite: {
          build: {
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      {
        // Preload script — must be a separate file so contextBridge works.
        // Output matches getPreloadPath() in src/main/index.ts:
        //   path.join(app.getAppPath(), "dist-electron", "preload", "index.js")
        entry: "src/preload/index.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "preload/[name].js",
                format: "cjs",
              },
            },
          },
        },
      },
    ]),
    // Electron loads renderer from file:// which does not support the CORS
    // checks that `crossorigin` triggers for ES module scripts.  Strip the
    // attribute from the built HTML so scripts load without CORS errors.
    {
      name: "remove-crossorigin-for-electron",
      transformIndexHtml: {
        order: "post",
        handler(html: string) {
          return html.replace(/\scrossorigin/g, "");
        },
      },
    },
  ],
  build: {
    outDir: "dist",
  },
});
