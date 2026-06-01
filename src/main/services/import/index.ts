import fse from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { prisma } from "../../../utils/prisma";
import { computeMd5 } from "./md5";
import { invalidateCache } from "../classifier/classifier";
import { logger } from "../logger";
import { removeFtsEntries } from "../db-migrate";
import { reprocessFile } from "./reprocess";

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".pptx", ".txt",
  ".jpg", ".jpeg", ".png", ".tiff", ".bmp", ".webp",
]);

const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_CONCURRENT = 4;

/**
 * Live-control state for a running import task.
 * - `controller` signals abort (cancellation).
 * - `pauseState.promise` resolves when the user resumes (null when not paused).
 */
const taskControls = new Map<
  string,
  { controller: AbortController; pauseState: { promise: Promise<void> | null; resume?: () => void } }
>();

export function pauseImportTask(taskId: string): boolean {
  const c = taskControls.get(taskId);
  if (!c) return false;
  if (c.pauseState.promise) return false;
  c.pauseState.promise = new Promise<void>((resolve) => {
    c.pauseState.resume = resolve;
  });
  return true;
}

export function resumeImportTask(taskId: string): boolean {
  const c = taskControls.get(taskId);
  if (!c || !c.pauseState.promise) return false;
  c.pauseState.resume?.();
  c.pauseState.promise = null;
  return true;
}

export function cancelImportTask(taskId: string): boolean {
  const c = taskControls.get(taskId);
  if (!c) return false;
  c.controller.abort();
  if (c.pauseState.promise) {
    // Wake the worker so it can observe the abort.
    c.pauseState.resume?.();
    c.pauseState.promise = null;
  }
  return true;
}

export interface ScannedFile {
  path: string;
  fileName: string;
  extension: string;
  size: number;
  md5: string;
}

export interface ScanResult {
  files: ScannedFile[];
  totalSize: number;
  skippedCount: number;
  skippedReasons: { path: string; reason: string }[];
}

export interface ImportProgress {
  taskId: string;
  phase: "saving" | "textExtract" | "ocr" | "classify" | "done";
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  percentage: number;
  status: "running" | "completed" | "failed";
  importedCount: number;
  skippedCount: number;
  errorCount: number;
}

export type DuplicateAction = "overwrite" | "keep_both" | "skip";

export interface ImportOptions {
  duplicateAction: DuplicateAction;
  onProgress?: (progress: ImportProgress) => void;
  /** Caller-supplied AbortController; the import aborts when this fires. */
  signal?: AbortSignal;
  /**
   * Called before each work item; resolves when the worker may proceed.
   * Used to implement pause (return a pending promise until resumed).
   */
  beforeItem?: () => Promise<void>;
}

export interface ImportResult {
  taskId: string;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: { file: string; error: string }[];
}

async function extractZipToStaging(zipPath: string): Promise<string> {
  const hash = crypto.createHash("sha1").update(zipPath).digest("hex").slice(0, 8);
  const stagingDir = path.join(os.tmpdir(), "bid-doc-zip-extracts", hash);
  await fse.remove(stagingDir).catch(() => {});
  await fse.ensureDir(stagingDir);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(stagingDir, true);
  return stagingDir;
}

async function cleanupStaging(stagingDir: string): Promise<void> {
  await fse.remove(stagingDir).catch(() => {});
}

/** Iterative walk to avoid stack overflow on deep directory trees. */
async function walkDir(
  rootDir: string,
  maxFileSize: number,
  files: ScannedFile[],
  skippedReasons: { path: string; reason: string }[],
): Promise<void> {
  const dirs = [rootDir];
  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    let entries: fse.Dirent[];
    try {
      entries = await fse.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "__MACOSX"
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        dirs.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      if (
        entry.name.startsWith("~$") ||
        entry.name.startsWith("~") ||
        entry.name.endsWith(".tmp")
      ) {
        skippedReasons.push({ path: fullPath, reason: "临时/系统文件" });
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();

      if (!SUPPORTED_EXTENSIONS.has(ext) && ext !== ".ppt" && ext !== ".zip") {
        skippedReasons.push({ path: fullPath, reason: `不支持的格式: ${ext}` });
        continue;
      }

      if (ext === ".zip") {
        try {
          const stagingDir = await extractZipToStaging(fullPath);
          try {
            await walkDir(stagingDir, maxFileSize, files, skippedReasons);
          } finally {
            await cleanupStaging(stagingDir);
          }
        } catch (err) {
          skippedReasons.push({ path: fullPath, reason: `ZIP 解压失败: ${err instanceof Error ? err.message : String(err)}` });
        }
        continue;
      }

      // Legacy .ppt — skip with clear reason
      if (ext === ".ppt") {
        skippedReasons.push({ path: fullPath, reason: "暂不支持旧版 .ppt 格式，请转换为 .pptx 后重新导入" });
        continue;
      }

      const scanned = await tryScanFile(fullPath, entry.name, ext, maxFileSize);
      if (scanned) {
        files.push(scanned);
      }
    }
  }
}

export async function scanFolder(
  folderPath: string,
  options: { maxFileSize?: number } = {},
): Promise<ScanResult> {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const files: ScannedFile[] = [];
  const skippedReasons: { path: string; reason: string }[] = [];

  await walkDir(folderPath, maxFileSize, files, skippedReasons);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  return { files, totalSize, skippedCount: skippedReasons.length, skippedReasons };
}

/**
 * Scan a mix of file and folder paths. Used by the drag-and-drop import
 * flow where the user may drop a single file, several files, or one or
 * more folders at once.
 *
 * Each input path is stat'd: if it's a file, it goes through `tryScanFile`;
 * if it's a directory, it recurses via `walkDir`. Duplicate results
 * (same MD5) are de-duplicated while keeping the first occurrence.
 */
export async function scanPaths(
  paths: string[],
  options: { maxFileSize?: number } = {},
): Promise<ScanResult> {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const files: ScannedFile[] = [];
  const skippedReasons: { path: string; reason: string }[] = [];
  const seen = new Set<string>();

  const takeIfNew = (scanned: ScannedFile): void => {
    if (seen.has(scanned.md5)) return;
    seen.add(scanned.md5);
    files.push(scanned);
  };

  for (const p of paths) {
    let stat: fse.Stats;
    try {
      stat = await fse.stat(p);
    } catch (err) {
      skippedReasons.push({ path: p, reason: `路径无法访问: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    if (stat.isDirectory()) {
      await walkDir(p, maxFileSize, files, skippedReasons);
      // Re-mark seen MD5s after walkDir (it doesn't dedupe).
      files.forEach((f) => seen.add(f.md5));
      continue;
    }

    if (!stat.isFile()) {
      skippedReasons.push({ path: p, reason: "不是普通文件或目录" });
      continue;
    }

    const ext = path.extname(p).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext) && ext !== ".ppt" && ext !== ".zip") {
      skippedReasons.push({ path: p, reason: `不支持的格式: ${ext}` });
      continue;
    }

    const fileName = path.basename(p);
    const scanned = await tryScanFile(p, fileName, ext, maxFileSize);
    if (scanned) {
      takeIfNew(scanned);
    } else {
      skippedReasons.push({ path: p, reason: "文件过大、为空或读取失败" });
    }
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  return { files, totalSize, skippedCount: skippedReasons.length, skippedReasons };
}

async function tryScanFile(
  fullPath: string,
  fileName: string,
  ext: string,
  maxFileSize: number,
): Promise<ScannedFile | null> {
  let stat: fse.Stats;
  try {
    stat = await fse.stat(fullPath);
  } catch {
    return null;
  }

  if (stat.size === 0) return null;
  if (stat.size > maxFileSize) return null;

  let md5: string;
  try {
    md5 = await computeMd5(fullPath);
  } catch {
    return null;
  }

  return { path: fullPath, fileName, extension: ext, size: stat.size, md5 };
}

export function findDuplicates(
  files: ScannedFile[],
): Map<string, ScannedFile[]> {
  const md5Map = new Map<string, ScannedFile[]>();
  for (const file of files) {
    const group = md5Map.get(file.md5) ?? [];
    group.push(file);
    md5Map.set(file.md5, group);
  }

  const dups = new Map<string, ScannedFile[]>();
  for (const [md5, group] of md5Map) {
    if (group.length > 1) {
      dups.set(md5, group);
    }
  }
  return dups;
}

export async function checkExistingDuplicates(
  files: ScannedFile[],
): Promise<DuplicateGroup[]> {
  const md5s = [...new Set(files.map((f) => f.md5))];
  if (md5s.length === 0) return [];

  const existing: Array<{ id: string; md5: string; fileName: string }> = await prisma.file.findMany({
    where: { md5: { in: md5s } },
    select: { id: true, md5: true, fileName: true },
  });

  const existingMap = new Map<string, { id: string; md5: string; fileName: string }>(
    existing.map((e) => [e.md5, e]),
  );
  const groups: DuplicateGroup[] = [];

  for (const file of files) {
    const ex = existingMap.get(file.md5);
    if (ex) {
      const existing = groups.find((g) => g.md5 === file.md5);
      if (existing) {
        existing.files.push(file);
      } else {
        groups.push({
          md5: file.md5,
          files: [file],
          existingDbFile: { id: ex.id, fileName: ex.fileName },
        });
      }
    }
  }

  return groups;
}

async function processPipeline(
  fileId: string,
  _filePath: string,
  _fileName: string,
  _ext: string,
  onProgress: (phase: string, current: string) => void,
): Promise<void> {
  // Delegates to the public reprocess module which loads its own state from
  // the DB. Kept as a thin wrapper so the existing call sites in
  // `importFiles` don't need to change.
  await reprocessFile(fileId, { onProgress });
}

export interface DuplicateGroup {
  md5: string;
  files: ScannedFile[];
  existingDbFile: { id: string; fileName: string };
}

async function processSingleFile(
  file: ScannedFile,
  duplicateAction: DuplicateAction,
  taskId: string,
): Promise<{ status: "imported" | "skipped" | "error"; error?: string; fileId?: string }> {
  try {
    const existing = await prisma.file.findUnique({ where: { md5: file.md5 } });

    if (existing) {
      if (duplicateAction === "skip") {
        return { status: "skipped" };
      }

      if (duplicateAction === "overwrite") {
        await prisma.file.update({
          where: { id: existing.id },
          data: {
            originalPath: file.path,
            fileName: file.fileName,
            extension: file.extension,
            size: file.size,
            extractedText: "",
            importStatus: "pending",
            importTaskId: taskId,
            updatedAt: new Date(),
          },
        });
        return { status: "imported", fileId: existing.id };
      }

      const dupMd5 = `${file.md5}_dup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const created = await prisma.file.create({
        data: {
          originalPath: file.path,
          fileName: file.fileName,
          extension: file.extension,
          size: file.size,
          md5: dupMd5,
          importStatus: "pending",
          importTaskId: taskId,
        },
      });
      return { status: "imported", fileId: created.id };
    }

    const created = await prisma.file.create({
      data: {
        originalPath: file.path,
        fileName: file.fileName,
        extension: file.extension,
        size: file.size,
        md5: file.md5,
        importStatus: "pending",
        importTaskId: taskId,
      },
    });

    return { status: "imported", fileId: created.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", error: message };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  options: { signal?: AbortSignal; beforeItem?: () => Promise<void> } = {},
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  let aborted = false;

  async function worker(): Promise<void> {
    while (index < items.length) {
      if (options.signal?.aborted) {
        aborted = true;
        return;
      }
      if (options.beforeItem) {
        await options.beforeItem();
      }
      if (options.signal?.aborted) {
        aborted = true;
        return;
      }
      const current = index++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers: Promise<void>[] = [];
  const effectiveConcurrency = Math.min(concurrency, items.length);
  for (let i = 0; i < effectiveConcurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  // Trim to actual processed length so callers can iterate cleanly.
  return aborted ? results.slice(0, index) : results;
}

export async function importFiles(
  scannedFiles: ScannedFile[],
  options: ImportOptions,
): Promise<ImportResult> {
  if (scannedFiles.length === 0) {
    return { taskId: "", importedCount: 0, skippedCount: 0, errorCount: 0, errors: [] };
  }

  // Invalidate classifier cache so new rules are picked up
  invalidateCache();

  const task = await prisma.importTask.create({
    data: {
      sourcePath: path.dirname(scannedFiles[0].path),
      status: "running",
      totalFiles: scannedFiles.length,
      options: JSON.stringify({ duplicateAction: options.duplicateAction }),
    },
  });

  // Register the live controls so pause/cancel IPCs can find this task.
  const controller = new AbortController();
  const pauseState: { promise: Promise<void> | null; resume?: () => void } = { promise: null };
  taskControls.set(task.id, { controller, pauseState });

  const beforeItem = async (): Promise<void> => {
    if (controller.signal.aborted) return;
    if (pauseState.promise) {
      await prisma.importTask.update({
        where: { id: task.id },
        data: { status: "paused" },
      }).catch(() => {});
      await pauseState.promise;
      await prisma.importTask.update({
        where: { id: task.id },
        data: { status: "running" },
      }).catch(() => {});
    }
  };

  let importedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: { file: string; error: string }[] = [];
  const importedFiles: Array<{ file: ScannedFile; fileId: string }> = [];
  let processedSoFar = 0;

  const emitProgress = (currentFile: string, phase: ImportProgress["phase"]) => {
    options.onProgress?.({
      taskId: task.id,
      phase,
      totalFiles: scannedFiles.length,
      processedFiles: processedSoFar,
      currentFile,
      percentage: Math.round((processedSoFar / scannedFiles.length) * 100),
      status: controller.signal.aborted ? "failed" : "running",
      importedCount,
      skippedCount,
      errorCount,
    });
  };

  try {
    // Phase 1: Save records
    await runWithConcurrency(
      scannedFiles,
      MAX_CONCURRENT,
      async (file, idx) => {
        if (controller.signal.aborted) return { file, result: { status: "skipped" as const } };
        const result = await processSingleFile(file, options.duplicateAction, task.id);

        if (result.status === "imported" && result.fileId) {
          importedCount++;
          importedFiles.push({ file, fileId: result.fileId });
        } else if (result.status === "skipped") {
          skippedCount++;
        } else {
          errorCount++;
          errors.push({ file: file.fileName, error: result.error ?? "未知错误" });
        }

        processedSoFar = idx + 1;
        if (idx % 5 === 0 || idx === scannedFiles.length - 1) {
          emitProgress(file.fileName, "saving");
        }

        return { file, result };
      },
      { signal: controller.signal, beforeItem },
    );

    // Phase 2: Pipeline
    await runWithConcurrency(
      importedFiles,
      MAX_CONCURRENT,
      async ({ file, fileId }) => {
        if (controller.signal.aborted) return undefined;
        try {
          await processPipeline(fileId, file.path, file.fileName, file.extension, (phase) => {
            emitProgress(file.fileName, phase as ImportProgress["phase"]);
          });
        } catch (err) {
          logger.error(`[import] pipeline failed for ${file.fileName}:`, err);
        }
        return undefined;
      },
      { signal: controller.signal, beforeItem },
    );
  } finally {
    taskControls.delete(task.id);
  }

  const cancelled = controller.signal.aborted;

  // On cancel, clean up any phase-1 records that didn't get their phase-2
  // pipeline update — they would otherwise linger as `importStatus: "pending"`
  // and pollute the documents list.
  if (cancelled) {
    try {
      const stale = await prisma.file.findMany({
        where: { importTaskId: task.id, importStatus: "pending" },
        select: { id: true },
      });
      if (stale.length > 0) {
        const ids = stale.map((f) => f.id);
        await prisma.file.deleteMany({ where: { id: { in: ids } } });
        await removeFtsEntries(ids);
      }
    } catch (err) {
      logger.error("[import] failed to clean up cancelled task files:", err);
    }
  }

  const finalStatus = cancelled
    ? "failed"
    : (errorCount > 0 && importedCount === 0 ? "failed" : "completed");
  await prisma.importTask.update({
    where: { id: task.id },
    data: {
      status: finalStatus,
      processedFiles: cancelled ? processedSoFar : scannedFiles.length,
      errorCount,
      errors: errors.length > 0 ? JSON.stringify(errors) : undefined,
    },
  });

  options.onProgress?.({
    taskId: task.id,
    phase: "done",
    totalFiles: scannedFiles.length,
    processedFiles: cancelled ? processedSoFar : scannedFiles.length,
    currentFile: "",
    percentage: 100,
    status: cancelled ? "failed" : (finalStatus === "failed" ? "failed" : "completed"),
    importedCount,
    skippedCount,
    errorCount,
  });

  return { taskId: task.id, importedCount, skippedCount, errorCount, errors };
}

export { computeMd5 } from "./md5";
export { reprocessFile, reprocessFiles, type ReprocessSummary } from "./reprocess";
