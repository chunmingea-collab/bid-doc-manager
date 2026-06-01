import * as fs from "fs-extra";
import * as path from "path";
import { app } from "electron";
import { prisma } from "../../utils/prisma";
import { logger } from "./logger";

/**
 * On first launch, the user's `userData/bid_doc_manager.db` does not exist yet.
 * We ship an empty, fully-migrated template DB at `<resources>/prisma/bid_doc_manager.db`
 * and copy it into place if missing. Existing user DBs are never overwritten.
 */
export async function ensureUserDatabase(): Promise<void> {
  const userDir = app.getPath("userData");
  const userDb = path.join(userDir, "bid_doc_manager.db");
  if (await fs.pathExists(userDb)) {
    return;
  }

  await fs.ensureDir(userDir);

  const candidates = [
    path.join(process.resourcesPath ?? "", "prisma", "bid_doc_manager.db"),
    path.join(process.cwd(), "prisma", "bid_doc_manager.db"),
  ];

  const source = candidates.find((p) => fs.existsSync(p));
  if (!source) {
    throw new Error(
      `Database template not found. Tried:\n${candidates.join("\n")}`,
    );
  }

  await fs.copy(source, userDb);
}

/**
 * Ensure the FTS5 virtual table and its triggers exist.
 *
 * Idempotent: safe to run on every launch. Trigger names match the ones
 * declared in `prisma/migrations/20260528000000_add_fts5/`, so on a
 * fully-migrated DB this is a complete no-op. The function exists for
 * the legacy upgrade path where the template DB was shipped before
 * FTS5 was added via a migration.
 */
export async function ensureFts5(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
        id UNINDEXED,
        fileName,
        extractedText,
        correctedText,
        tokenize='unicode61'
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS file_fts_ai AFTER INSERT ON File
      WHEN NEW.isDeleted = 0
      BEGIN
        INSERT INTO file_fts(id, fileName, extractedText, correctedText)
        VALUES (NEW.id, NEW.fileName, NEW.extractedText, COALESCE(NEW.correctedText, ''));
      END
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS file_fts_ad AFTER DELETE ON File
      BEGIN
        DELETE FROM file_fts WHERE id = OLD.id;
      END
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS file_fts_au AFTER UPDATE OF fileName, extractedText, correctedText, isDeleted ON File
      BEGIN
        DELETE FROM file_fts WHERE id = OLD.id;
        INSERT INTO file_fts(id, fileName, extractedText, correctedText)
        SELECT NEW.id, NEW.fileName, NEW.extractedText, COALESCE(NEW.correctedText, '')
        WHERE NEW.isDeleted = 0;
      END
    `);

    logger.info("[db-migrate] FTS5 virtual table and triggers ensured");
  } catch (err) {
    logger.error("[db-migrate] Failed to ensure FTS5:", err);
  }
}

/**
 * Delete from FTS5 index when a file is soft-deleted.
 */
export async function removeFtsEntry(fileId: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM file_fts WHERE id = ?`, fileId);
  } catch {
    // non-fatal — FTS5 may not exist yet, search falls back
  }
}

/**
 * Bulk variant: remove several FTS rows in a single statement. Skips the
 * try/catch for each id — failures are surfaced to the caller.
 */
export async function removeFtsEntries(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  try {
    const placeholders = fileIds.map(() => "?").join(",");
    await prisma.$executeRawUnsafe(
      `DELETE FROM file_fts WHERE id IN (${placeholders})`,
      ...fileIds,
    );
  } catch {
    // non-fatal — FTS5 may not exist yet, search falls back
  }
}
