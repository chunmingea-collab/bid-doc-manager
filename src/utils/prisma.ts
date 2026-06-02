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

// ---------------------------------------------------------------------------
// Profile-aware database URL
// ---------------------------------------------------------------------------
// Each user "profile" (a company/enterprise the user is bidding for) has its
// own SQLite file under `userData/profiles/<name>/bid_doc_manager.db`. The
// "active profile" is stored in `userData/current-profile.json` and
// determines which DB the singleton Prisma client points at.
//
// In tests / non-Electron contexts, there is no profile system — fall back
// to the repo's prisma template DB (used by Vitest's e2e-ish tests).

let activeProfileName: string | null = null;

export function setActiveProfileName(name: string | null): void {
  if (activeProfileName === name) return;
  activeProfileName = name;
  // Force the lazy client factory to re-resolve on next access.
  cachedClient = null;
  cachedClientUrl = null;
}

export function getActiveProfileName(): string | null {
  return activeProfileName;
}

function isElectronContext(): boolean {
  try {
    const electron = require("electron") as typeof import("electron") | undefined;
    return !!electron?.app;
  } catch {
    return false;
  }
}

function userDataDir(): string | null {
  try {
    const electron = require("electron") as typeof import("electron") | undefined;
    const app = electron?.app;
    if (app && typeof app.getPath === "function") {
      const dir = app.getPath("userData");
      mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch {
    // Not in Electron context.
  }
  return null;
}

function profileDbPath(userDir: string, profileName: string): string {
  const safe = profileName.replace(/[\\/:*?"<>|]/g, "_");
  return path.join(userDir, "profiles", safe, "bid_doc_manager.db");
}

export function computeDbUrl(): string {
  const userDir = userDataDir();
  if (userDir && activeProfileName) {
    return `file:${profileDbPath(userDir, activeProfileName)}`;
  }
  if (userDir) {
    // No active profile yet (wizard mode). Use a placeholder path; the
    // caller should not query the DB until a profile is set.
    return `file:${path.join(userDir, "__no_active_profile__")}`;
  }
  return "file:./prisma/bid_doc_manager.db";
}

// ---------------------------------------------------------------------------
// Lazy singleton with hot-swap
// ---------------------------------------------------------------------------
// Switching the active profile invalidates `cachedClient`; the next property
// access re-instantiates a PrismaClient against the new DB URL. The old
// client's connection pool is drained lazily; the SQLite WAL is reopened by
// the new instance on first query.

let cachedClient: PrismaClient | null = null;
let cachedClientUrl: string | null = null;

function getClient(): PrismaClient {
  const url = computeDbUrl();
  if (cachedClient && cachedClientUrl === url) return cachedClient;
  if (cachedClient) {
    // Best-effort disconnect — never throws to the caller.
    void cachedClient.$disconnect().catch(() => undefined);
  }
  cachedClient = new PrismaClient({ datasources: { db: { url } } });
  cachedClientUrl = url;
  return cachedClient;
}

/**
 * Singleton proxy. All property accesses are forwarded to the *current*
 * PrismaClient (re-instantiated on profile change). Methods are bound to
 * the underlying client so `this`-sensitive Prisma internals keep working.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, prop) {
    const client = getClient();
    return Reflect.has(client, prop);
  },
});

export function isReady(): boolean {
  return activeProfileName !== null;
}

export function isElectron(): boolean {
  return isElectronContext();
}
