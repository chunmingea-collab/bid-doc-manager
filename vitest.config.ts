import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.ts",
    ],
    exclude: [
      "node_modules",
      "dist",
      "dist-electron",
      "release",
    ],
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
