import { defineConfig } from "@playwright/test";

/**
 * Playwright config for Electron end-to-end tests.
 *
 * Run from project root:
 *   pnpm test:e2e           # builds app + runs e2e
 *   pnpm test:e2e:ui        # opens Playwright UI
 *
 * Each test launches its own Electron instance with an isolated userData dir
 * so tests don't pollute each other. Skipped in headless CI (no display).
 */
export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
