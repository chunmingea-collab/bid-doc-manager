import { PrismaClient } from "../generated/prisma";
import path from "path";
import { mkdirSync, existsSync } from "fs";

// Resolve the Prisma query engine binary in production builds.
//
// In dev/tests, Prisma finds the engine next to the generated client in
// src/generated/prisma. In a packaged Electron app, the engine's `.node`
// file is unpacked from the asar to `app.asar.unpacked/src/generated/prisma/`
// (see electron-builder.yml asarUnpack). The runtime code lives inside the
// asar at `app.asar/src/generated/prisma/`, so the auto-discovered
// `dirname`-based lookup paths miss the unpacked engine. We point Prisma at
// the asar-unpacked engine file directly via PRISMA_QUERY_ENGINE_BINARY.
// Falls back to the default lookup if the override file doesn't exist.
function resolvePrismaEnginePaths(): void {
  if (process.env.PRISMA_QUERY_ENGINE_BINARY) return;

  // The asar sits at <appOut>/resources/app.asar; the unpacked copy is at
  // <appOut>/resources/app.asar.unpacked. Path layout mirrors the in-asar
  // tree because we use asarUnpack (not extraResources) to extract.
  const isPackaged =
    !!process.resourcesPath && /\.asar[\\/](unpacked)?$/.test(process.resourcesPath) === false &&
    process.resourcesPath.includes("app.asar.unpacked") === false;

  if (!isPackaged) {
    // In dev, the auto-discovery works (engine is next to the generated
    // client at src/generated/prisma). Nothing to override.
    return;
  }

  // process.resourcesPath is <appOut>/resources; the asar lives at
  // <resourcesDir>/app.asar and the unpacked copy at
  // <resourcesDir>/app.asar.unpacked.
  const resourcesDir = process.resourcesPath;
  const unpackedRoot = path.join(resourcesDir, "app.asar.unpacked");
  if (!existsSync(unpackedRoot)) return;

  const candidates = [
    "query_engine-windows.dll.node",
    "query_engine-linux.so.node",
    "query_engine-darwin.dylib.node",
    "query_engine-darwin-arm64.dylib.node",
  ];

  // Walk the unpacked tree for the first matching engine binary.
  const stack = [unpackedRoot];
  const fsModule = require("fs") as typeof import("fs");
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: import("fs").Dirent[] | undefined;
    try {
      entries = fsModule.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (candidates.includes(entry.name)) {
        process.env.PRISMA_QUERY_ENGINE_BINARY = full;
        return;
      }
    }
  }
}

resolvePrismaEnginePaths();

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
