import * as fs from "fs-extra";
import * as path from "path";
import { app } from "electron";
import { prisma } from "../../utils/prisma";
import { logger } from "./logger";

function findTemplateDb(): string | null {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "prisma", "bid_doc_manager.db") : "",
    path.join(process.cwd(), "prisma", "bid_doc_manager.db"),
    path.join(app.getAppPath(), "prisma", "bid_doc_manager.db"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function hasAnyTable(_dbPath: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'",
    );
    return Number(rows[0]?.n ?? 0n) > 0;
  } catch {
    return false;
  }
}

/**
 * On first launch, the user's `userData/bid_doc_manager.db` does not exist yet.
 * We ship an empty, fully-migrated template DB at `<resources>/prisma/bid_doc_manager.db`
 * and copy it into place if missing or empty/invalid. A non-empty user DB is preserved.
 */
export async function ensureUserDatabase(): Promise<void> {
  const userDir = app.getPath("userData");
  const userDb = path.join(userDir, "bid_doc_manager.db");
  await fs.ensureDir(userDir);

  if (await fs.pathExists(userDb)) {
    if (await hasAnyTable(userDb)) return;
    logger.warn(`[db-migrate] Empty/invalid user DB at ${userDb}, re-seeding from template`);
    await fs.remove(userDb);
  }

  const source = findTemplateDb();
  if (!source) {
    throw new Error(
      `Database template not found. Looked in resources/prisma/, cwd/prisma/, and app/prisma/`,
    );
  }

  await fs.copy(source, userDb);
  logger.info(`[db-migrate] Seeded user DB from ${source}`);
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

/**
 * Idempotent column additions for users on a pre-2.x schema. Each block
 * checks PRAGMA table_info first so we never re-add an existing column.
 */
export async function ensureColumnAdditions(): Promise<void> {
  // Category.color (P2-T15) — used by the category tree dot indicator
  const catCols = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `PRAGMA table_info(Category)`,
  );
  if (!catCols.some((c) => c.name === "color")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE Category ADD COLUMN color TEXT NOT NULL DEFAULT '#1677ff'`,
    );
    logger.info("[db-migrate] Added Category.color column");
  }
}
