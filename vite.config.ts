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
    electron({
      entry: "src/main/index.ts",
      preload: "src/preload/index.ts",
      renderer: "index.html",
      vite: {
        build: {
          rollupOptions: {
            // Keep electron out of the bundle. The generated Prisma client
            // is bundled directly (resolved via the import in
            // src/utils/prisma.ts which points at src/generated/prisma)
            // so the .node binary's reference resolves through the asar.
            external: ["electron"],
          },
        },
      },
    }),
  ],
  // For build mode - output renderer files
  build: {
    outDir: "dist",
  },
});