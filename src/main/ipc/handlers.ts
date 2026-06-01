import { ipcMain, dialog, shell, BrowserWindow, app } from "electron";
import * as path from "path";
import * as fs from "fs-extra";
import {
  scanFolder,
  scanPaths,
  importFiles,
  pauseImportTask,
  resumeImportTask,
  cancelImportTask,
  reprocessFiles,
  type ScanResult,
  type ScannedFile,
  type DuplicateAction,
} from "../services/import/index";
import { isAvailable as getOcrAvailable, getOcrStatus } from "../services/ocr";
import { searchDocuments, type SearchFilters } from "../services/search-service";
import { exportToExcel, exportDocuments } from "../services/export-service";
import { backupData, restoreData } from "../services/backup-service";
import { checkExpiringDocuments } from "../services/reminder-service";
import { invalidateCache as invalidateClassifierCache, previewCategoryMatch, classifyDocument } from "../services/classifier/classifier";
import { extractKeyInfo } from "../services/classifier/key-info-extractor";
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

  // Drag-and-drop variant: scan a mixed list of file/folder paths.
  ipcMain.handle("import:scanPaths", safeHandler(async (_event, paths: string[]): Promise<ScanResult> => {
    if (!Array.isArray(paths) || paths.length === 0) {
      return { files: [], totalSize: 0, skippedCount: 0, skippedReasons: [] };
    }
    return scanPaths(paths);
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

  // --- Import: Pause / Resume / Cancel ---
  ipcMain.handle("import:pause", safeHandler(async (_event, taskId: string) => {
    const ok = pauseImportTask(taskId);
    return { paused: ok };
  }));

  ipcMain.handle("import:resume", safeHandler(async (_event, taskId: string) => {
    const ok = resumeImportTask(taskId);
    return { resumed: ok };
  }));

  ipcMain.handle("import:cancel", safeHandler(async (_event, taskId: string) => {
    const ok = cancelImportTask(taskId);
    return { cancelled: ok };
  }));

  // --- Re-run OCR/classification on existing files ---
  ipcMain.handle(
    "import:reprocess",
    safeHandler(async (_event, fileIds: string[]) => {
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return { total: 0, succeeded: 0, failed: 0, skipped: 0, results: [] };
      }
      return reprocessFiles(fileIds, {
        onProgress: (processed, total, fileName) => {
          const win = BrowserWindow.getFocusedWindow();
          win?.webContents.send("import:reprocessProgress", { processed, total, fileName });
        },
      });
    }),
  );

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

  // Read a single file's bytes for in-app preview (PDF, image, etc.).
  // The renderer can't `fs.readFile` directly under contextIsolation, so the
  // main process brokers the bytes. We cap at 50 MB to prevent OOM.
  ipcMain.handle(
    "file:read",
    safeHandler(async (_event, filePath: string): Promise<{ bytes: number[]; mime: string }> => {
      const fs = await import("fs/promises");
      const stat = await fs.stat(filePath);
      if (stat.size > 50 * 1024 * 1024) {
        throw new Error(`文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），无法在应用内预览。请使用「在文件夹中显示」打开。`);
      }
      const buf = await fs.readFile(filePath);
      const ext = filePath.toLowerCase().split(".").pop() ?? "";
      const mime =
        ext === "pdf" ? "application/pdf" :
        ext === "png" ? "image/png" :
        ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
        ext === "gif" ? "image/gif" :
        ext === "webp" ? "image/webp" :
        ext === "bmp" ? "image/bmp" :
        "application/octet-stream";
      return { bytes: Array.from(buf), mime };
    }),
  );

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

  ipcMain.handle("backup:list", safeHandler(async (_event, dir?: string) => {
    const target = dir && dir.length > 0 ? dir : path.join(app.getPath("documents"), "BidDocManagerBackups");
    if (!(await fs.pathExists(target))) return [];
    const entries = await fs.readdir(target);
    const results: { name: string; size: number; mtime: number }[] = [];
    for (const name of entries) {
      if (!name.startsWith("bid-manager-backup-") || !name.endsWith(".zip")) continue;
      const full = path.join(target, name);
      const st = await fs.stat(full);
      results.push({ name, size: st.size, mtime: st.mtimeMs });
    }
    results.sort((a, b) => b.name.localeCompare(a.name));
    return results;
  }));

  ipcMain.handle("backup:delete", safeHandler(async (_event, dir: string | undefined, name: string) => {
    const target = dir && dir.length > 0 ? dir : path.join(app.getPath("documents"), "BidDocManagerBackups");
    if (!/^bid-manager-backup-.*\.zip$/.test(name)) {
      throw new Error("非法的备份文件名");
    }
    const full = path.join(target, name);
    if (!(await fs.pathExists(full))) return { success: true };
    await fs.remove(full);
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

  // --- File Detail (read-only; for the OCR correction drawer) ---
  ipcMain.handle("file:detail", safeHandler(async (_event, fileId: string) => {
    const f = await prisma.file.findUnique({
      where: { id: fileId },
      include: { category: true, tags: true },
    });
    if (!f) return null;
    return {
      id: f.id,
      fileName: f.fileName,
      originalPath: f.originalPath,
      extension: f.extension,
      size: f.size,
      extractedText: f.extractedText,
      correctedText: f.correctedText,
      certificateNumber: f.certificateNumber,
      companyName: f.companyName,
      personName: f.personName,
      qualificationLevel: f.qualificationLevel,
      expiryDate: f.expiryDate,
      importStatus: f.importStatus,
      importError: f.importError,
      categoryId: f.categoryId,
      categoryName: f.category?.name ?? null,
      tags: f.tags.map((t) => t.name),
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
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

  // --- Recycle bin ---
  ipcMain.handle(
    "recycleBin:list",
    safeHandler(async () => {
      const rows = await prisma.file.findMany({
        where: { isDeleted: true },
        orderBy: { deletedAt: "desc" },
        select: {
          id: true,
          fileName: true,
          extension: true,
          originalPath: true,
          size: true,
          deletedAt: true,
        },
      });
      return rows;
    }),
  );

  ipcMain.handle(
    "recycleBin:restore",
    safeHandler(async (_event, fileId: string) => {
      const file = await prisma.file.findUnique({ where: { id: fileId } });
      if (!file) throw new Error("文件不存在");
      if (!file.isDeleted) throw new Error("文件未在回收站中");
      await prisma.file.update({
        where: { id: fileId },
        data: { isDeleted: false, deletedAt: null },
      });
      // Re-add the FTS5 row.
      await prisma.$executeRawUnsafe(
        `INSERT INTO file_fts(id, fileName, extractedText, correctedText)
         VALUES (?, ?, ?, COALESCE(?, ''))`,
        file.id,
        file.fileName,
        file.extractedText,
        file.correctedText,
      );
      return { success: true };
    }),
  );

  ipcMain.handle(
    "recycleBin:purge",
    safeHandler(async (_event, fileId: string) => {
      await prisma.file.delete({ where: { id: fileId } });
      return { success: true };
    }),
  );

  ipcMain.handle(
    "recycleBin:purgeAll",
    safeHandler(async () => {
      const result = await prisma.file.deleteMany({ where: { isDeleted: true } });
      return { purged: result.count };
    }),
  );

  // --- Correct Text ---
  ipcMain.handle("file:correctText", safeHandler(async (_event, { fileId, correctedText }: { fileId: string; correctedText: string }) => {
    const trimmed = correctedText ?? "";
    // Use the corrected text (if any) as the source for re-extraction; fall
    // back to the originally extracted text when the user clears the field.
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw new Error("文件不存在");

    const sourceText = trimmed.length > 0 ? trimmed : file.extractedText;
    const keyInfo = extractKeyInfo(sourceText);
    const classification = await classifyDocument(file.fileName, sourceText);
    const categoryId = classification.categoryId;

    await prisma.file.update({
      where: { id: fileId },
      data: {
        correctedText: trimmed.length > 0 ? trimmed : null,
        certificateNumber: keyInfo.certificateNumber || null,
        companyName: keyInfo.companyName || null,
        personName: keyInfo.personName || null,
        qualificationLevel: keyInfo.qualificationLevel || null,
        expiryDate: keyInfo.expiryDate || null,
        categoryId,
      },
    });

    // Update the FTS5 row so search reflects the new text + extracted fields.
    await removeFtsEntry(fileId);
    await prisma.$executeRawUnsafe(
      `INSERT INTO file_fts(id, fileName, extractedText, correctedText)
       VALUES (?, ?, ?, COALESCE(?, ''))`,
      file.id,
      file.fileName,
      sourceText,
      trimmed.length > 0 ? trimmed : null,
    );

    return { success: true, categoryId, keyInfo: toPublicKeyInfo(keyInfo) };
  }));

  // Helper: turn the extractor's `string|null` into the renderer's `string`
  // contract (empty string for null) so the UI never has to null-check.
  function toPublicKeyInfo(ki: {
    expiryDate: string | null;
    certificateNumber: string | null;
    companyName: string | null;
    personName: string | null;
    qualificationLevel: string | null;
  }): {
    expiryDate: string;
    certificateNumber: string;
    companyName: string;
    personName: string;
    qualificationLevel: string;
  } {
    return {
      expiryDate: ki.expiryDate ?? "",
      certificateNumber: ki.certificateNumber ?? "",
      companyName: ki.companyName ?? "",
      personName: ki.personName ?? "",
      qualificationLevel: ki.qualificationLevel ?? "",
    };
  }

  // --- Categories CRUD ---
  ipcMain.handle("category:getAll", safeHandler(async () => {
    const rows = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      keywords: r.keywords ? r.keywords.split(",").filter((k: string) => k) : [],
      isCustom: r.isCustom,
      sortOrder: r.sortOrder,
      color: r.color,
    }));
  }));

  ipcMain.handle("category:create", safeHandler(async (_event, data: { id: string; name: string; parentId: string | null; keywords: string[]; isCustom: boolean; color?: string }) => {
    const cat = await prisma.category.create({
      data: {
        id: data.id,
        name: data.name,
        parentId: data.parentId,
        keywords: data.keywords.join(","),
        isCustom: data.isCustom,
        sortOrder: 0,
        color: data.color ?? "#1677ff",
      },
    });
    invalidateClassifierCache();
    return { id: cat.id, name: cat.name, color: cat.color };
  }));

  ipcMain.handle("category:update", safeHandler(async (_event, data: { id: string; name?: string; parentId?: string | null; keywords?: string[]; color?: string }) => {
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.parentId !== undefined) payload.parentId = data.parentId;
    if (data.keywords !== undefined) payload.keywords = data.keywords.join(",");
    if (data.color !== undefined) payload.color = data.color;
    await prisma.category.update({ where: { id: data.id }, data: payload });
    invalidateClassifierCache();
    return { success: true };
  }));

  ipcMain.handle("category:reorder", safeHandler(async (_event, orderedIds: string[]) => {
    if (!Array.isArray(orderedIds)) throw new Error("orderedIds must be an array");
    // Apply sortOrder = index. SQLite is fine with thousands of updates; we
    // only ever have a few dozen categories so a single transaction is fast.
    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.category.update({ where: { id }, data: { sortOrder: idx } }),
      ),
    );
    invalidateClassifierCache();
    return { success: true };
  }));

  ipcMain.handle("category:applyToFiles", safeHandler(async (_event, { categoryId, fileIds }: { categoryId: string; fileIds: string[] }) => {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error("fileIds 不能为空");
    }
    const result = await prisma.file.updateMany({
      where: { id: { in: fileIds }, isDeleted: false },
      data: { categoryId },
    });
    return { updated: result.count };
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

  // --- Category preview: count files that would match a category if re-classified ---
  ipcMain.handle(
    "category:previewMatch",
    safeHandler(async (_event, categoryId: string) => {
      return previewCategoryMatch(categoryId);
    }),
  );

  // --- Dashboard Stats ---
  ipcMain.handle("dashboard:stats", safeHandler(async (): Promise<DashboardStats> => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const days90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const days90Iso = `${days90.getFullYear()}-${String(days90.getMonth() + 1).padStart(2, "0")}-${String(days90.getDate()).padStart(2, "0")}`;

    const [totalCount, thisMonthCount, errorCount, expiringCount] = await Promise.all([
      prisma.file.count({ where: { isDeleted: false } }),
      prisma.file.count({ where: { isDeleted: false, createdAt: { gte: monthStart } } }),
      prisma.file.count({ where: { isDeleted: false, importStatus: "error" } }),
      // "Expiring" = not yet expired AND expiring within 90 days.
      prisma.file.count({
        where: {
          isDeleted: false,
          expiryDate: { not: null, gte: todayIso, lte: days90Iso },
        },
      }),
    ]);

    return { totalCount, thisMonthCount, errorCount, expiringCount };
  }));

  ipcMain.handle(
    "dashboard:recent",
    safeHandler(async (_event, limit?: number): Promise<Array<{ id: string; fileName: string; category: string | null; importStatus: string; createdAt: string }>> => {
      const take = Math.min(Math.max(limit ?? 10, 1), 50);
      const rows = await prisma.file.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          fileName: true,
          importStatus: true,
          createdAt: true,
          category: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        category: r.category?.name ?? null,
        importStatus: r.importStatus,
        createdAt: r.createdAt.toISOString(),
      }));
    }),
  );

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
