/**
 * Pure validation helpers for the category IPC handlers. Kept separate so
 * they can be unit-tested without spinning up an Electron process or a
 * real Prisma client.
 */

export interface CategoryReorderInput {
  orderedIds: unknown;
}

export function validateReorderInput(input: CategoryReorderInput): string[] {
  const { orderedIds } = input;
  if (!Array.isArray(orderedIds)) {
    throw new Error("orderedIds must be an array");
  }
  if (orderedIds.length === 0) {
    throw new Error("orderedIds must not be empty");
  }
  if (!orderedIds.every((id) => typeof id === "string" && id.length > 0)) {
    throw new Error("orderedIds must contain only non-empty strings");
  }
  return orderedIds as string[];
}

export interface ApplyToFilesInput {
  categoryId: unknown;
  fileIds: unknown;
}

export function validateApplyToFilesInput(input: ApplyToFilesInput): { categoryId: string; fileIds: string[] } {
  const { categoryId, fileIds } = input;
  if (typeof categoryId !== "string" || categoryId.length === 0) {
    throw new Error("categoryId must be a non-empty string");
  }
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    throw new Error("fileIds must be a non-empty array");
  }
  if (!fileIds.every((id) => typeof id === "string" && id.length > 0)) {
    throw new Error("fileIds must contain only non-empty strings");
  }
  return { categoryId, fileIds: fileIds as string[] };
}

export interface BackupDeleteInput {
  dir: unknown;
  name: unknown;
}

export function validateBackupDeleteInput(input: BackupDeleteInput): { dir: string; name: string } {
  const { dir, name } = input;
  // The regex is strict: must start with our prefix, contain only safe
  // characters (alnum + dash + dot + 'T' + colon replacement), and end
  // with .zip. Critically, it forbids '/' and '\\' so that path-traversal
  // attempts like '../etc/passwd' are rejected before they reach the
  // filesystem.
  if (
    typeof name !== "string" ||
    !/^bid-manager-backup-[0-9A-Za-zT\-.]+\.zip$/.test(name)
  ) {
    throw new Error("非法的备份文件名");
  }
  if (typeof dir !== "string") {
    throw new Error("dir must be a string");
  }
  return { dir, name };
}
