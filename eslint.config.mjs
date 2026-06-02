import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
// Node 25 strict-ESM doesn't auto-resolve the implicit `main` of
// `globals` (which has no package.json `main`/`exports` field). Pin the
// explicit file path so the resolver doesn't error out.
import globals from "globals/index.js";

const nodeGlobals = {
  ...globals.node,
  ...globals.es2022,
};

const browserGlobals = {
  ...globals.browser,
  ...globals.es2022,
  React: "readonly",
  JSX: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "dist-electron/**",
      "release/**",
      "out/**",
      "build/pyinstaller/**",
      ".venv-paddleocr/**",
      "paddle-ocr-models/**",
      "src/generated/**",
      "scripts/generate-logo.cjs",
      "scripts/pack-ico.cjs",
      "scripts/patch-prisma-stub.js",
      "scripts/after-pack.js",
      "scripts/download-paddle-models.js",
      "scripts/generate-installer-header.js",
      "scripts/build-paddleocr-runner.ps1",
      "scripts/paddleocr_runner.py",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: { globals: browserGlobals },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    files: [
      "src/main/**/*.{ts,tsx}",
      "src/utils/**/*.ts",
      "src/preload/**/*.ts",
      "scripts/__tests__/**/*.ts",
    ],
    languageOptions: { globals: nodeGlobals },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      // Allow `require()` in the bundled CJS preload entry & main entry.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
