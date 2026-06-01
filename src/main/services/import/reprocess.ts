import fse from "fs-extra";
import { prisma } from "../../../utils/prisma";
import { extractText } from "../ocr/text-extractor";
import { recognizeText } from "../ocr/ocr-service";
import { classifyDocument, invalidateCache } from "../classifier/classifier";
import { extractKeyInfo } from "../classifier/key-info-extractor";
import { logger } from "../logger";

/**
 * Re-run the OCR + classification + key-info pipeline on an existing file.
 * Used by the "批量重试" action on the Documents page to recover files
 * that failed during the initial import (e.g. transient OCR engine error,
 * missing model file at import time, etc.).
 *
 * Returns the updated file's `importStatus` so the caller can tell whether
 * the retry succeeded. Never throws — all errors are caught and recorded.
 */
export async function reprocessFile(
  fileId: string,
  options: { onProgress?: (phase: string, fileName: string) => void } = {},
): Promise<{ fileId: string; fileName: string; status: "completed" | "error" | "skipped"; error?: string }> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    return { fileId, fileName: "(unknown)", status: "error", error: "文件不存在" };
  }
  if (file.isDeleted) {
    return { fileId, fileName: file.fileName, status: "skipped", error: "文件已在回收站中" };
  }
  if (!fse.existsSync(file.originalPath)) {
    await prisma.file.update({
      where: { id: fileId },
      data: { importStatus: "error", importError: "原文件已不存在" },
    });
    return { fileId, fileName: file.fileName, status: "error", error: "原文件已不存在" };
  }

  const ext = file.extension;
  const fileName = file.fileName;
  let text = "";

  if ([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".txt"].includes(ext)) {
    options.onProgress?.("textExtract", fileName);
    try {
      const result = await extractText(file.originalPath);
      text = result.text ?? "";
    } catch (err) {
      logger.warn(`[reprocess] text extraction failed for ${fileName}:`, err);
    }
  }

  if (!text && [".jpg", ".jpeg", ".png", ".tiff", ".bmp", ".webp"].includes(ext)) {
    options.onProgress?.("ocr", fileName);
    try {
      const result = await recognizeText(file.originalPath);
      if (result.success) {
        text = result.text;
      }
    } catch (err) {
      logger.warn(`[reprocess] OCR failed for ${fileName}:`, err);
    }
  }

  if (!text && ext === ".txt") {
    options.onProgress?.("textExtract", fileName);
    try {
      text = (await fse.readFile(file.originalPath)).toString("utf-8");
    } catch {
      logger.warn(`[reprocess] failed to read txt ${fileName}`);
    }
  }

  options.onProgress?.("classify", fileName);
  // The classifier caches keyword rules in memory. Bump the cache so any
  // user edits to keywords take effect on the retry.
  invalidateCache();
  let categoryId: string | null = file.categoryId;
  try {
    const result = await classifyDocument(fileName, text);
    categoryId = result.categoryId;
  } catch (err) {
    logger.warn(`[reprocess] classification failed for ${fileName}:`, err);
  }

  let keyInfo: Record<string, string | null | undefined> = {};
  if (text) {
    try {
      keyInfo = extractKeyInfo(text) as unknown as Record<string, string | null | undefined>;
    } catch (err) {
      logger.warn(`[reprocess] key info extraction failed for ${fileName}:`, err);
    }
  }

  try {
    await prisma.file.update({
      where: { id: fileId },
      data: {
        extractedText: text,
        categoryId,
        importStatus: "completed",
        importError: null,
        ...(Object.keys(keyInfo).length > 0 ? {
          certificateNumber: keyInfo.certificateNumber ?? undefined,
          expiryDate: keyInfo.expiryDate ?? undefined,
          companyName: keyInfo.companyName ?? undefined,
          personName: keyInfo.personName ?? undefined,
          qualificationLevel: keyInfo.qualificationLevel ?? undefined,
        } : {}),
      },
    });
    return { fileId, fileName, status: "completed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.file.update({
      where: { id: fileId },
      data: { importStatus: "error", importError: message },
    }).catch(() => null);
    return { fileId, fileName, status: "error", error: message };
  }
}

/**
 * Bulk variant: re-process a list of file IDs with the same concurrency cap
 * used for the original import. Emits per-file progress events.
 */
export interface ReprocessSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{ fileId: string; fileName: string; status: "completed" | "error" | "skipped"; error?: string }>;
}

const REPROCESS_CONCURRENCY = 4;

export async function reprocessFiles(
  fileIds: string[],
  options: {
    onProgress?: (processed: number, total: number, fileName: string) => void;
  } = {},
): Promise<ReprocessSummary> {
  const total = fileIds.length;
  const results: ReprocessSummary["results"] = [];
  let index = 0;
  let processed = 0;

  async function worker(): Promise<void> {
    while (index < fileIds.length) {
      const current = index++;
      const id = fileIds[current];
      const r = await reprocessFile(id, {
        onProgress: (phase, fileName) => {
          options.onProgress?.(processed, total, fileName);
          // `phase` is currently only used for telemetry, not surfaced to the UI.
          void phase;
        },
      });
      results.push(r);
      processed++;
      options.onProgress?.(processed, total, r.fileName);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(REPROCESS_CONCURRENCY, fileIds.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const succeeded = results.filter((r) => r.status === "completed").length;
  const failed = results.filter((r) => r.status === "error").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  return { total, succeeded, failed, skipped, results };
}
