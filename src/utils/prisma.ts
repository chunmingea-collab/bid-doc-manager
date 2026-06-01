import { PrismaClient } from ".prisma/client";
import path from "path";
import { mkdirSync } from "fs";

// Resolve user data directory for database storage.
// In Electron main process, uses app.getPath('userData').
// Falls back to project prisma/ directory for tests.
function getDbUrl(): string {
  try {
    // `require` here keeps the import out of the renderer/test bundles
    // — electron is only available in the main process.
    const electron = require("electron") as typeof import("electron") | undefined;
    const app = electron?.app;
    if (app && typeof app.getPath === "function") {
      const userDataPath = app.getPath("userData");
      mkdirSync(userDataPath, { recursive: true });
      return `file:${path.join(userDataPath, "bid_doc_manager.db")}`;
    }
  } catch {
    // Not in Electron context (tests, etc.)
  }
  return "file:./prisma/bid_doc_manager.db";
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDbUrl(),
    },
  },
});

export { prisma };
