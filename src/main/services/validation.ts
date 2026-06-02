/**
 * Pure validation helpers for the IPC handlers. Kept separate so they
 * can be unit-tested without spinning up an Electron process or a real
 * Prisma client.
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

const RESERVED_PROFILE_NAMES = new Set(["CON", "PRN", "AUX", "NUL"]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Coerce + validate a user-supplied profile (enterprise) name. Returns the
 * cleaned name. Throws on invalid input.
 */
export function validateProfileName(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("企业名称必须是字符串");
  const name = raw.trim();
  if (!name) throw new Error("企业名称不能为空");
  if (name.length > 40) throw new Error("企业名称不能超过 40 个字符");
  if (name.startsWith(".")) throw new Error("企业名称不能以 . 开头");
  if (/[\\/:*?"<>|]/.test(name)) {
    throw new Error("企业名称包含非法字符 (\\ / : * ? \" < > |)");
  }
  if (RESERVED_PROFILE_NAMES.has(name.toUpperCase())) {
    throw new Error(`"${name}" 是 Windows 保留名`);
  }
  return name;
}

export function validateProfileColor(raw: unknown): string {
  if (typeof raw !== "string" || !HEX_COLOR.test(raw)) {
    throw new Error("颜色必须是 #RRGGBB 格式");
  }
  return raw.toLowerCase();
}
