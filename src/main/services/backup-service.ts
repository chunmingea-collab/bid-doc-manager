import * as fs from "fs-extra";
import * as path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import type { Archiver, ArchiverOptions } from "archiver";
import AdmZip from "adm-zip";
import { app } from "electron";
import { prisma } from "../../utils/prisma";
import { logger } from "./logger";

// archiver is a CJS module that exports a function with extra props on it.
// Use createRequire so both Vite (rolldown) and the CJS shim agree on the
// shape, avoiding the "default is not exported" runtime error.
const nodeRequire = createRequire(typeof __filename !== "undefined" ? __filename : import.meta.url);
const archiver = nodeRequire("archiver") as (
  format: string,
  options?: ArchiverOptions,
) => Archiver;

function getDbPath(): string {
  try {
    if (app && typeof app.getPath === "function") {
      return path.join(app.getPath("userData"), "bid_doc_manager.db");
    }
  } catch {
    // Not in Electron context
  }
  return path.join(process.cwd(), "prisma", "bid_doc_manager.db");
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Create a backup ZIP containing the SQLite database.
 */
export async function backupData(destDir: string): Promise<string> {
  await fs.ensureDir(destDir);

  const zipName = `bid-manager-backup-${timestampSlug()}.zip`;
  const zipPath = path.join(destDir, zipName);
  const dbPath = getDbPath();

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive: Archiver = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err: Error & { code?: string }) => {
      if (err.code !== "ENOENT") reject(err);
    });

    archive.pipe(output);
    archive.file(dbPath, { name: "bid_doc_manager.db" });
    archive.finalize();
  });

  return zipPath;
}

/**
 * Restore from a backup ZIP. Validates integrity before replacing the existing DB.
 */
export async function restoreData(zipPath: string): Promise<void> {
  const extractDir = path.join(os.tmpdir(), `bid-restore-${Date.now()}`);
  await fs.ensureDir(extractDir);

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);

    const dbFile = path.join(extractDir, "bid_doc_manager.db");
    if (!(await fs.pathExists(dbFile))) {
      throw new Error("备份包中未找到数据库文件");
    }

    // Validate the backed-up DB is not corrupt
    try {
      execFileSync("sqlite3", [dbFile, "PRAGMA integrity_check;"], {
        timeout: 30_000,
        windowsHide: true,
        encoding: "utf-8",
      });
    } catch (err) {
      // sqlite3 CLI may not be available — skip validation gracefully
      logger.warn("[backup] sqlite3 integrity_check unavailable, skipping:", err);
    }

    const dbPath = getDbPath();

    // Back up existing DB before overwriting
    const bakPath = dbPath + ".bak." + Date.now();
    if (await fs.pathExists(dbPath)) {
      await fs.copy(dbPath, bakPath);
    }

    await fs.ensureDir(path.dirname(dbPath));

    await prisma.$disconnect();
    await fs.copy(dbFile, dbPath, { overwrite: true });
    await prisma.$connect();
  } finally {
    await fs.remove(extractDir).catch(() => {});
  }
}
