#!/usr/bin/env node
/**
 * Patch pnpm 9+ symlinks so that @prisma/client at runtime can find the
 * generated client files.
 *
 * Background: pnpm 9 hard-links packages from `.pnpm/<name>@<ver>/node_modules/<name>/`
 * into top-level `node_modules/<name>/` as a symlink. Prisma's CLI, when it
 * generates the client, places files under both `node_modules/.prisma/client/`
 * and `node_modules/.pnpm/@prisma+client@<ver>_prisma@<ver>/node_modules/.prisma/client/`.
 * With pnpm 10, the latter directory exists but is not properly populated
 * (only stubs), so runtime `import { PrismaClient } from '@prisma/client'`
 * fails with "Prisma client did not initialize yet".
 *
 * This script copies the real generated files from the top-level location
 * into the pnpm-managed location, idempotently.
 *
 * Run automatically via `postinstall` after `pnpm install`.
 */
const fs = require("fs");
const path = require("path");

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isFile()) {
      // Only copy if missing or different. Skip if same size & mtime.
      let needsCopy = true;
      try {
        const ss = fs.statSync(s);
        const dd = fs.statSync(d);
        if (dd.size === ss.size && dd.mtimeMs >= ss.mtimeMs) {
          needsCopy = false;
        }
      } catch {
        // dst doesn't exist
      }
      if (needsCopy) {
        fs.copyFileSync(s, d);
      }
    }
  }
}

function patchPrismaClient() {
  const topLevel = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ".prisma",
    "client",
  );
  if (!fs.existsSync(topLevel)) {
    // Prisma generate hasn't run yet; nothing to patch.
    return false;
  }

  // Find every pnpm-managed @prisma/client location
  const pnpmDir = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ".pnpm",
  );
  if (!fs.existsSync(pnpmDir)) return false;

  const candidates = fs
    .readdirSync(pnpmDir)
    .filter((n) => n.startsWith("@prisma+client@") && n.includes("_prisma@"));
  let patchedAny = false;
  for (const c of candidates) {
    const target = path.join(
      pnpmDir,
      c,
      "node_modules",
      ".prisma",
      "client",
    );
    if (!fs.existsSync(path.dirname(target))) continue;
    try {
      copyDir(topLevel, target);
      patchedAny = true;
    } catch (err) {
      console.warn(
        `[patch-prisma-stub] failed to copy to ${target}: ${err && err.message}`,
      );
    }
  }
  return patchedAny;
}

if (require.main === module) {
  const ok = patchPrismaClient();
  if (ok) {
    console.log("[patch-prisma-stub] ✓ patched pnpm Prisma client stubs");
  } else {
    console.log(
      "[patch-prisma-stub] no patch needed (run after `pnpm prisma:generate`)",
    );
  }
}

module.exports = { patchPrismaClient };
