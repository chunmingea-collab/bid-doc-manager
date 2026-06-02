import * as fs from "fs-extra";
import * as path from "path";
import { app } from "electron";
import { backupData } from "./backup-service";
import { getSetting, setSetting } from "./settings-service";
import { logger } from "./logger";
import { isReady as prismaReady } from "../../utils/prisma";

const SCHEDULE_TICK_MS = 60 * 1000; // 1 minute — cheap because we early-exit when not due

let timer: NodeJS.Timeout | null = null;
let lastTickDay = ""; // YYYY-MM-DD; used for daily/weekly windows
let lastQuitHooked = false;

function defaultBackupDir(): string {
  try {
    return path.join(app.getPath("documents"), "BidDocManagerBackups");
  } catch {
    return path.join(process.cwd(), "backups");
  }
}

function pickDayKeyImpl(d: Date, cadence: "daily" | "weekly"): string {
  // For weekly, we anchor to ISO week (year-Www) so the day key only changes once per week.
  if (cadence === "weekly") {
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+target - +yearStart) / 86400000 + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Exported for unit testing. Determines the deduplication key for a
 * scheduled run: the date itself for daily, the ISO week for weekly.
 */
export const pickDayKey = pickDayKeyImpl;

function pickHour(d: Date): number {
  return d.getHours();
}

/**
 * Run a backup with retry on transient I/O failure.
 * Records the result into the `lastBackupAt` / `lastBackupPath` settings so the
 * Settings page can show "上次备份" and the scheduler can compute the next
 * run window.
 */
async function runBackupWithRetry(): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const destDir = (await getSetting("autoBackupDir")) || defaultBackupDir();
  const attempts = 2;
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const zipPath = await backupData(destDir);
      await setSetting("lastBackupAt", new Date().toISOString());
      await setSetting("lastBackupPath", zipPath);
      return { ok: true, path: zipPath };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      logger.warn(`[auto-backup] attempt ${i + 1} failed:`, lastErr);
    }
  }
  return { ok: false, error: lastErr };
}

/**
 * Delete old backup ZIPs keeping the N most recent files in the given dir.
 * Errors are swallowed: backup retention is a janitor task and must not
 * crash the scheduler tick.
 */
/**
 * Pure helper: from a list of file names, decide which ones to keep and
 * which to delete to satisfy the `keep` invariant. Exported for unit
 * testing so we don't need a real directory in CI.
 *
 * Backups are sorted by name descending (ISO timestamps are designed to
 * sort lexicographically), then we keep the first `keep` items and
 * delete the rest. Empty / non-matching entries are ignored.
 */
export function pickFilesToDelete(fileNames: string[], keep: number): string[] {
  const safeKeep = Math.max(0, Math.floor(keep));
  const backups = fileNames
    .filter((f) => f.startsWith("bid-manager-backup-") && f.endsWith(".zip"))
    .sort((a, b) => b.localeCompare(a));
  return backups.slice(safeKeep);
}

async function retainLatest(dir: string, keep: number): Promise<void> {
  if (!(await fs.pathExists(dir))) return;
  const files = (await fs.readdir(dir))
    .filter((f) => f.startsWith("bid-manager-backup-") && f.endsWith(".zip"));
  const toDelete = pickFilesToDelete(files, keep);
  for (const name of toDelete) {
    const full = path.join(dir, name);
    try {
      await fs.remove(full);
      logger.info(`[auto-backup] pruned ${name}`);
    } catch (err) {
      logger.warn(`[auto-backup] failed to prune ${name}:`, err);
    }
  }
}

async function tick(): Promise<void> {
  // No active profile yet (wizard hasn't run). The placeholder DB has no
  // tables — skip silently rather than logging Prisma errors.
  if (!prismaReady()) return;
  const cadence = await getSetting("autoBackupCadence");
  if (cadence === "off") return;
  const now = new Date();

  if (cadence === "onQuit") return; // handled in before-quit hook

  // Only fire at 03:00 local (the configured reminderHour would be a nicer
  // anchor, but auto-backup is intentionally decoupled from reminder timing
  // so users can keep reminders at 09:00 but still want 03:00 backups).
  if (pickHour(now) !== 3) return;

  const key = pickDayKey(now, cadence as "daily" | "weekly");
  if (key === lastTickDay) return; // already ran this window
  lastTickDay = key;

  const keep = Math.max(1, await getSetting("autoBackupKeep"));
  const dir = (await getSetting("autoBackupDir")) || defaultBackupDir();

  logger.info(`[auto-backup] tick: cadence=${cadence} key=${key} keep=${keep} dir=${dir}`);
  const result = await runBackupWithRetry();
  if (result.ok) {
    await retainLatest(dir, keep);
  } else {
    logger.error(`[auto-backup] failed both attempts: ${result.error}`);
  }
}

function hookQuit(): void {
  if (lastQuitHooked) return;
  lastQuitHooked = true;
  app.on("before-quit", async (_e) => {
    try {
      const onQuit = await getSetting("autoBackupOnQuit");
      if (!onQuit) return;
      // Don't block quit for too long — we already have a snapshot safety net.
      const dir = (await getSetting("autoBackupDir")) || defaultBackupDir();
      const keep = Math.max(1, await getSetting("autoBackupKeep"));
      const result = await runBackupWithRetry();
      if (result.ok) {
        await retainLatest(dir, keep);
      } else {
        logger.error(`[auto-backup] on-quit backup failed: ${result.error}`);
      }
    } catch (err) {
      logger.error("[auto-backup] on-quit hook error:", err);
    }
    // Intentionally do NOT call e.preventDefault — the user pressed quit and
    // we should respect it even if backup failed. They still have the manual
    // backup button as a fallback.
  });
}

/**
 * Start the background scheduler. Idempotent — calling twice is a no-op.
 * Safe to call from the Electron main process during app startup.
 */
export function startAutoBackupScheduler(): void {
  if (timer) return;
  hookQuit();
  // Run one tick immediately so users get a backup on first launch.
  void tick();
  timer = setInterval(() => {
    void tick();
  }, SCHEDULE_TICK_MS);
  // Don't keep the event loop alive solely for backups.
  if (typeof timer.unref === "function") timer.unref();
}

export function stopAutoBackupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
