import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@prisma/client": path.resolve(__dirname, "node_modules/.prisma/client"),
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
            external: ["electron", ".prisma/client"],
          },
        },
        resolve: {
          alias: {
            "@prisma/client": path.resolve(__dirname, "node_modules/.prisma/client"),
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