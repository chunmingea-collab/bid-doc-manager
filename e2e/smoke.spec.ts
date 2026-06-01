// Smoke checks that don't require a display.
//
// Full Electron-driven e2e (Playwright `_electron.launch`) is intentionally
// NOT included because:
//   1. The app's main process targets a Windows desktop with a real display.
//      In headless CI environments the BrowserWindow either can't be created
//      or fires `window-all-closed` immediately, leaving Playwright hanging.
//   2. The bundled main process (`dist-electron/index.js`) uses
//      `app.getAppPath()` for renderer/preload paths, but Rolldown's CJS
//      shim emits `__dirname` references that don't survive sandboxing.
//
// When you have a Windows CI runner with a display, enable the full suite by:
//   - un-skipping the test below
//   - adding `@playwright/test`'s `_electron` to a new file
//   - passing `args: ['.']` + the same e2e env vars `BID_DOC_E2E_USER_DATA`
//     and `BID_DOC_E2E=1` we wired in `src/main/services/test-mode.ts`

import { test, expect } from "@playwright/test";

test("build artifact exists (renderer)", async () => {
  // Sanity check: production build of the renderer must exist on disk.
  // This catches "forgot to run pnpm build" without spinning up Electron.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const distHtml = path.resolve(__dirname, "..", "dist", "index.html");
  await expect(fs.access(distHtml).then(() => true, () => false)).resolves.toBe(true);
});

test.skip("Electron window renders dashboard (TODO: needs display)", async () => {
  // See file header for the enablement steps.
  expect(true).toBe(true);
});
