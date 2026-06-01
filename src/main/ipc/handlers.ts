import { ipcMain, dialog, shell, BrowserWindow, app } from "electron";
import * as path from "path";
import {
  scanFolder,
  importFiles,
  type ScanResult,
  type ScannedFile,
  type DuplicateAction,
} from "../services/import/index";
import { isAvailable as getOcrAvailable, getOcrStatus } from "../services/ocr";
import { searchDocuments, type SearchFilters } from "../services/search-service";
import { exportToExcel, exportDocuments } from "../services/export-service";
import { backupData, restoreData } from "../services/backup-service";
import { checkExpiringDocuments } from "../services/reminder-service";
import { invalidateCache as invalidateClassifierCache } from "../services/classifier/classifier";
import { seedCategories } from "../services/seed-service";
import {
  getAllSettings,
  setSetting,
  type SettingKey,
  SETTINGS_DEFAULTS,
} from "../services/settings-service";
import {
  getRecentNotifications,
  runReminderCheckAndNotify,
  startNotificationSchedule,
} from "../services/notification-service";
import { prisma } from "../../utils/prisma";
import { parseExpiryToDate, daysBetween } from "../../utils/date";
import { removeFtsEntry } from "../services/db-migrate";
import { logger } from "../services/logger";

export interface DashboardStats {
  totalCount: number;
  thisMonthCount: number;
  errorCount: number;
  expiringCount: number;
}

/** Wrap an IPC handler to catch errors and return a serialized error string
 *  instead of letting exceptions propagate as unhandled rejections. */
function safeHandler<T extends unknown[]>(
  fn: (...args: T) => unknown,
): (...args: T) => Promise<unknown> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      logger.error("[ipc] handler error:", err);
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  };
}

export function registerIpcHandlers(): void {
  // --- Dialog ---
  ipcMain.handle("dialog:openDirectory", safeHandler(async () => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "选择导入文件夹",
    });
    return filePaths[0] ?? null;
  }));

  ipcMain.handle("dialog:openFile", safeHandler(async (_event, filters?: Electron.FileFilter[]) => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: filters && filters.length > 0 ? filters : [{ name: "All Files", extensions: ["*"] }],
    });
    return filePaths[0] ?? null;
  }));

  // --- Import: Scan ---
  ipcMain.handle("import:scan", safeHandler(async (_event, folderPath: string): Promise<ScanResult> => {
    return scanFolder(folderPath);
  }));

  // --- Import: Start ---
  ipcMain.handle("import:start", safeHandler(async (
    _event,
    { scannedFiles, duplicateAction }: { scannedFiles: ScannedFile[]; duplicateAction: DuplicateAction },
  ) => {
    return importFiles(scannedFiles, {
      duplicateAction,
      onProgress: (progress) => {
        const win = BrowserWindow.getFocusedWindow();
        win?.webContents.send("import:progress", progress);
      },
    });
  }));

  // --- OCR Status ---
  ipcMain.handle("ocr:status", safeHandler(async () => {
    return getOcrAvailable();
  }));

  ipcMain.handle("ocr:statusDetail", safeHandler(async (_event, refresh = false) => {
    return getOcrStatus(refresh);
  }));

  // --- Search ---
  ipcMain.handle("search:documents", safeHandler(async (_event, filters: SearchFilters, page = 1, pageSize = 20) => {
    return searchDocuments(filters, page, pageSize);
  }));

  // --- Shell ---
  ipcMain.handle("shell:openExternal", safeHandler(async (_event, url: string) => {
    await shell.openExternal(url);
  }));

  ipcMain.handle("shell:openPath", safeHandler(async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  }));

  // --- Export ---
  ipcMain.handle("export:excel", safeHandler(async (_event, { fileIds }: { fileIds: string[] }) => {
    const files = await prisma.file.findMany({
      where: { id: { in: fileIds }, isDeleted: false },
      include: { category: true, tags: true },
    });
    const documents = files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      category: f.category?.name ?? null,
      tags: f.tags.map((t) => t.name),
      size: f.size,
      expiryDate: f.expiryDate ? new Date(f.expiryDate) : null,
      keyInfo: {
        certificateNumber: f.certificateNumber ?? "",
        companyName: f.companyName ?? "",
        expiryDate: f.expiryDate ?? "",
        personName: f.personName ?? "",
        qualificationLevel: f.qualificationLevel ?? "",
      },
      originalPath: f.originalPath,
    }));
    const outputPath = path.join(app.getPath("downloads"), `文档清单_${Date.now()}.xlsx`);
    await exportToExcel(documents, outputPath);
    return { filePath: outputPath, count: documents.length };
  }));

  ipcMain.handle("export:zip", safeHandler(async (_event, { fileIds, destDir }: { fileIds: string[]; destDir?: string }) => {
    const files = await prisma.file.findMany({
      where: { id: { in: fileIds }, isDeleted: false },
    });
    const items = files.map((f) => ({ originalPath: f.originalPath, fileName: f.fileName }));
    const targetDir = destDir || path.join(app.getPath("downloads"), `文档导出_${Date.now()}`);
    const result = await exportDocuments(items, targetDir);
    return { filePath: targetDir, count: result.success.length, ...result };
  }));

  // --- Backup ---
  ipcMain.handle("backup:create", safeHandler(async (_event, destDir?: string) => {
    const dir = destDir || path.join(app.getPath("downloads"));
    const filePath = await backupData(dir);
    const timestamp = new Date().toISOString();
    await setSetting("lastBackupAt", timestamp);
    await setSetting("lastBackupPath", filePath);
    return { filePath, timestamp };
  }));

  ipcMain.handle("backup:restore", safeHandler(async (_event, zipPath: string) => {
    await restoreData(zipPath);
    return { success: true };
  }));

  // --- Reminder ---
  ipcMain.handle("reminder:check", safeHandler(async () => {
    const { overdue, within30Days, within60Days, within90Days } = await checkExpiringDocuments();
    const now = new Date();
    const mapBucket = (docs: typeof overdue, bucket: string) =>
      docs.map((d) => {
        const dt = parseExpiryToDate(d.expiryDate);
        return {
          id: d.id,
          fileName: d.fileName,
          expireDate: d.expiryDate ?? "",
          companyName: d.companyName ?? "",
          certificateNumber: d.certificateNumber ?? "",
          daysLeft: dt ? daysBetween(now, dt) : 0,
          bucket,
        };
      });
    return {
      overdue: mapBucket(overdue, "overdue"),
      within30Days: mapBucket(within30Days, "30days"),
      within60Days: mapBucket(within60Days, "60days"),
      within90Days: mapBucket(within90Days, "90days"),
    };
  }));

  // --- File Delete ---
  ipcMain.handle("file:delete", safeHandler(async (_event, fileId: string) => {
    await prisma.file.update({
      where: { id: fileId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await removeFtsEntry(fileId);
    return { success: true };
  }));

  // --- Correct Text ---
  ipcMain.handle("file:correctText", safeHandler(async (_event, { fileId, correctedText }: { fileId: string; correctedText: string }) => {
    await prisma.file.update({
      where: { id: fileId },
      data: { correctedText },
    });
    return { success: true };
  }));

  // --- Categories CRUD ---
  ipcMain.handle("category:getAll", safeHandler(async () => {
    const rows = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      keywords: r.keywords ? r.keywords.split(",").filter((k: string) => k) : [],
      isCustom: r.isCustom,
      sortOrder: r.sortOrder,
    }));
  }));

  ipcMain.handle("category:create", safeHandler(async (_event, data: { id: string; name: string; parentId: string | null; keywords: string[]; isCustom: boolean }) => {
    const cat = await prisma.category.create({
      data: {
        id: data.id,
        name: data.name,
        parentId: data.parentId,
        keywords: data.keywords.join(","),
        isCustom: data.isCustom,
        sortOrder: 0,
      },
    });
    invalidateClassifierCache();
    return { id: cat.id, name: cat.name };
  }));

  ipcMain.handle("category:update", safeHandler(async (_event, data: { id: string; name: string; parentId: string | null; keywords: string[] }) => {
    await prisma.category.update({
      where: { id: data.id },
      data: { name: data.name, parentId: data.parentId, keywords: data.keywords.join(",") },
    });
    invalidateClassifierCache();
    return { success: true };
  }));

  ipcMain.handle("category:delete", safeHandler(async (_event, id: string) => {
    const toDelete = new Set<string>();
    const collect = async (parentId: string) => {
      toDelete.add(parentId);
      const children = await prisma.category.findMany({ where: { parentId } });
      for (const child of children) {
        await collect(child.id);
      }
    };
    await collect(id);
    await prisma.category.deleteMany({ where: { id: { in: [...toDelete] } } });
    invalidateClassifierCache();
    return { success: true };
  }));

  ipcMain.handle("category:reset", safeHandler(async () => {
    await prisma.category.deleteMany({});
    await seedCategories();
    invalidateClassifierCache();
    return { success: true };
  }));

  // --- Dashboard Stats ---
  ipcMain.handle("dashboard:stats", safeHandler(async (): Promise<DashboardStats> => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const days90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const days90Iso = `${days90.getFullYear()}-${String(days90.getMonth() + 1).padStart(2, "0")}-${String(days90.getDate()).padStart(2, "0")}`;

    const [totalCount, thisMonthCount, errorCount, expiringCount] = await Promise.all([
      prisma.file.count({ where: { isDeleted: false } }),
      prisma.file.count({ where: { isDeleted: false, createdAt: { gte: monthStart } } }),
      prisma.file.count({ where: { isDeleted: false, importStatus: "error" } }),
      prisma.file.count({ where: { isDeleted: false, expiryDate: { not: null, lte: days90Iso } } }),
    ]);

    return { totalCount, thisMonthCount, errorCount, expiringCount };
  }));

  // --- Settings ---
  ipcMain.handle("settings:getAll", safeHandler(async () => {
    return getAllSettings();
  }));

  ipcMain.handle("settings:set", safeHandler(async (_event, key: SettingKey, value: unknown) => {
    if (!(key in SETTINGS_DEFAULTS)) {
      throw new Error(`Unknown setting key: ${key}`);
    }
    await setSetting(key, value as never);
    if (key === "reminderEnabled" || key === "reminderHour" || key === "reminderDays") {
      await startNotificationSchedule();
    }
    return { success: true };
  }));

  // --- Notifications ---
  ipcMain.handle("notification:list", safeHandler(async () => {
    return getRecentNotifications();
  }));

  ipcMain.handle("notification:checkNow", safeHandler(async () => {
    return runReminderCheckAndNotify(true);
  }));
}
