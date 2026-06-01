import { vi } from "vitest";

// Stub out the electron module so files that reference `app.getPath` can be
// imported in the Node-only test environment without crashing.
vi.mock("electron", () => ({
  app: {
    getPath: () => process.cwd(),
  },
}));
