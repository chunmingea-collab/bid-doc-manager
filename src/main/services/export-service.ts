import * as XLSX from 'xlsx';
import { copy, ensureDir } from 'fs-extra';
import { writeFile } from 'fs/promises';
import { basename, join } from 'path';

export interface ExportDocument {
  id: string;
  fileName: string;
  category: string | null;
  tags: string[];
  size: number; // bytes
  expiryDate: Date | null;
  keyInfo: Record<string, string>;
  originalPath: string;
}

/**
 * 将文档列表导出为 Excel 文件
 */
export async function exportToExcel(
  documents: ExportDocument[],
  outputPath: string,
): Promise<void> {
  const data = documents.map((doc) => ({
    文件名: doc.fileName,
    分类: doc.category ?? '未分类',
    标签: doc.tags.join(', '),
    大小: formatSize(doc.size),
    有效期: doc.expiryDate ? formatDate(doc.expiryDate) : '',
    ...flattenKeyInfo(doc.keyInfo),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '文档清单');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  await writeFile(outputPath, buffer);
}

/**
 * 导出单个文档（复制原文件到目标目录）
 */
export async function exportDocument(
  sourcePath: string,
  targetDir: string,
): Promise<string> {
  await ensureDir(targetDir);
  const destPath = join(targetDir, basename(sourcePath));
  await copy(sourcePath, destPath);
  return destPath;
}

/**
 * 批量导出文档（复制原文件到目标目录）
 * 单个文件失败不影响其他文件
 */
export async function exportDocuments(
  items: Array<{ originalPath: string; fileName: string }>,
  targetDir: string,
): Promise<{ success: string[]; failed: Array<{ originalPath: string; error: string }> }> {
  await ensureDir(targetDir);

  const success: string[] = [];
  const failed: Array<{ originalPath: string; error: string }> = [];

  for (const item of items) {
    try {
      const destPath = join(targetDir, item.fileName);
      await copy(item.originalPath, destPath);
      success.push(destPath);
    } catch (err) {
      failed.push({
        originalPath: item.originalPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { success, failed };
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function flattenKeyInfo(keyInfo: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(keyInfo)) {
    result[`信息:${key}`] = value;
  }
  return result;
}
