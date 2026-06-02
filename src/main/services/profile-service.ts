import * as fs from "fs-extra";
import * as path from "path";
import { app } from "electron";
import { setActiveProfileName, isReady, getActiveProfileName } from "../../utils/prisma";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/**
 * Per-profile metadata. Persisted as `userData/profiles/<name>/meta.json`.
 * The SQLite DB sits next to it at `bid_doc_manager.db`. We keep the meta
 * outside the DB on purpose: the wizard needs to list profiles (with names
 * + colors) before the user picks one and we open their DB.
 */
export interface ProfileMeta {
  id: string;              // uuid, stable across renames
  name: string;            // display name, also the folder name
  taxId?: string;          // 统一社会信用代码 (optional but recommended)
  color: string;           // hex, used by the switcher dot
  notes?: string;
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
}

export interface ProfileSummary extends ProfileMeta {
  sizeBytes: number;
  fileCount: number;
}

interface CurrentProfileFile {
  id: string;              // matches ProfileMeta.id
  name: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getUserDir(): string {
  return app.getPath("userData");
}

function profilesRoot(): string {
  return path.join(getUserDir(), "profiles");
}

function trashRoot(): string {
  return path.join(getUserDir(), ".trash");
}

function currentProfilePath(): string {
  return path.join(getUserDir(), "current-profile.json");
}

function profileDir(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "_");
  return path.join(profilesRoot(), safe);
}

function profileDbPath(name: string): string {
  return path.join(profileDir(name), "bid_doc_manager.db");
}

function profileMetaPath(name: string): string {
  return path.join(profileDir(name), "meta.json");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const RESERVED_NAMES = new Set(["CON", "PRN", "AUX", "NUL"]);

/**
 * Validate a profile name. Returns the cleaned (trimmed) name on success.
 * Throws on invalid input. Rules:
 *  - 1-40 chars after trim
 *  - no Windows-reserved names
 *  - no path separators or filesystem-illegal characters
 *  - cannot start with a dot (hidden on Unix, breaks the switcher sort)
 */
export function validateProfileName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new Error("企业名称不能为空");
  if (name.length > 40) throw new Error("企业名称不能超过 40 个字符");
  if (name.startsWith(".")) throw new Error("企业名称不能以 . 开头");
  if (/[\\/:*?"<>|]/.test(name)) {
    throw new Error("企业名称包含非法字符 (\\ / : * ? \" < > |)");
  }
  const upper = name.toUpperCase();
  if (RESERVED_NAMES.has(upper)) {
    throw new Error(`"${name}" 是 Windows 保留名`);
  }
  return name;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export function validateColor(c: string): string {
  if (!HEX_COLOR.test(c)) throw new Error("颜色必须是 #RRGGBB 格式");
  return c.toLowerCase();
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

async function readMeta(name: string): Promise<ProfileMeta> {
  const raw = await fs.readFile(profileMetaPath(name), "utf-8");
  return JSON.parse(raw) as ProfileMeta;
}

async function writeMeta(meta: ProfileMeta): Promise<void> {
  const updated = { ...meta, updatedAt: new Date().toISOString() };
  await fs.writeFile(profileMetaPath(meta.name), JSON.stringify(updated, null, 2), "utf-8");
}

async function findTemplateDb(): Promise<string | null> {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "prisma", "bid_doc_manager.db") : "",
    path.join(app.getAppPath(), "prisma", "bid_doc_manager.db"),
    path.join(process.cwd(), "prisma", "bid_doc_manager.db"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (await fs.pathExists(p)) return p;
  }
  return null;
}

async function readCurrentProfile(): Promise<CurrentProfileFile | null> {
  try {
    const raw = await fs.readFile(currentProfilePath(), "utf-8");
    const parsed = JSON.parse(raw) as CurrentProfileFile;
    if (parsed?.id && parsed?.name) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function writeCurrentProfile(meta: ProfileMeta | null): Promise<void> {
  if (meta === null) {
    await fs.remove(currentProfilePath()).catch(() => undefined);
    return;
  }
  const payload: CurrentProfileFile = { id: meta.id, name: meta.name };
  await fs.writeFile(currentProfilePath(), JSON.stringify(payload, null, 2), "utf-8");
}

async function profileDirSize(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop() as string;
    let entries: import("fs").Dirent[] = [];
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(full);
          total += stat.size;
        } catch {
          // ignore
        }
      }
    }
  }
  return total;
}

async function profileFileCount(dir: string): Promise<number> {
  // Count rows in File table (excluding soft-deleted).
  // We open a one-off PrismaClient scoped to this DB to avoid touching the
  // singleton (which points at the active profile).
  // Lazy import to avoid a circular dep at module-load time.
  const { PrismaClient } = await import("../../generated/prisma");
  const url = `file:${path.join(dir, "bid_doc_manager.db")}`;
  const probe = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await probe.file.count({ where: { isDeleted: false } });
    return rows;
  } catch {
    return 0;
  } finally {
    await probe.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Migration from the pre-profile DB layout
// ---------------------------------------------------------------------------

/**
 * If `userData/bid_doc_manager.db` exists (single-DB pre-profile world),
 * move it into a new profile "默认企业" and set it as active. Runs once
 * on first launch of the profile-aware build.
 */
export async function migrateLegacyDatabase(): Promise<void> {
  const legacy = path.join(getUserDir(), "bid_doc_manager.db");
  if (!(await fs.pathExists(legacy))) return;

  await fs.ensureDir(profilesRoot());

  const name = "默认企业";
  const targetDir = profileDir(name);
  if (!(await fs.pathExists(targetDir))) {
    await fs.ensureDir(targetDir);
    await fs.move(legacy, profileDbPath(name));
    // Move WAL/SHM/journal siblings too.
    for (const ext of ["-wal", "-shm", "-journal"]) {
      const sibling = legacy + ext;
      if (await fs.pathExists(sibling)) {
        await fs.move(sibling, profileDbPath(name) + ext);
      }
    }
    const meta: ProfileMeta = {
      id: crypto.randomUUID(),
      name,
      color: pickColorForName(name),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeMeta(meta);
    await writeCurrentProfile(meta);
    logger.info(`[profile] migrated legacy DB into profile "${name}"`);
  } else {
    // A profile by that name already exists — just delete the legacy file.
    await fs.remove(legacy).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function init(): Promise<void> {
  await fs.ensureDir(profilesRoot());
  await fs.ensureDir(trashRoot());
  await migrateLegacyDatabase();
  const current = await readCurrentProfile();
  if (current) {
    // Verify the profile still exists; if not, clear the pointer.
    if (await fs.pathExists(profileMetaPath(current.name))) {
      setActiveProfileName(current.name);
    } else {
      await writeCurrentProfile(null);
    }
  }
}

export async function listProfiles(): Promise<ProfileSummary[]> {
  await fs.ensureDir(profilesRoot());
  const names = await fs.readdir(profilesRoot());
  const out: ProfileSummary[] = [];
  for (const name of names) {
    const dir = profileDir(name);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    if (!(await fs.pathExists(profileMetaPath(name)))) continue;
    try {
      const meta = await readMeta(name);
      const [sizeBytes, fileCount] = await Promise.all([
        profileDirSize(dir),
        profileFileCount(dir),
      ]);
      out.push({ ...meta, sizeBytes, fileCount });
    } catch (err) {
      logger.warn(`[profile] skipping unreadable profile "${name}":`, err);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return out;
}

export async function getActiveProfile(): Promise<ProfileMeta | null> {
  const current = await readCurrentProfile();
  if (!current) return null;
  try {
    return await readMeta(current.name);
  } catch {
    return null;
  }
}

export interface CreateProfileInput {
  name: string;
  taxId?: string;
  color?: string;
  notes?: string;
}

/**
 * Create a new profile. Seeds its DB from the bundled template. Throws if
 * a profile with the same name already exists.
 */
export async function createProfile(input: CreateProfileInput): Promise<ProfileMeta> {
  const name = validateProfileName(input.name);
  validateColor(input.color ?? "#1677ff");
  if (await fs.pathExists(profileDir(name))) {
    throw new Error(`已存在同名企业："${name}"`);
  }

  const source = await findTemplateDb();
  if (!source) {
    throw new Error("找不到数据库模板文件 (prisma/bid_doc_manager.db)");
  }

  await fs.ensureDir(profileDir(name));
  await fs.copy(source, profileDbPath(name));

  const meta: ProfileMeta = {
    id: crypto.randomUUID(),
    name,
    color: (input.color ?? pickColorForName(name)).toLowerCase(),
    taxId: input.taxId?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeMeta(meta);

  // If no profile is active, auto-activate the new one.
  const current = await readCurrentProfile();
  if (!current) {
    await writeCurrentProfile(meta);
    setActiveProfileName(meta.name);
    emitActiveProfileChanged(meta.name);
  }
  return meta;
}

export async function renameProfile(oldName: string, newRawName: string): Promise<ProfileMeta> {
  const newName = validateProfileName(newRawName);
  if (oldName === newName) {
    const meta = await readMeta(oldName);
    return meta;
  }
  if (await fs.pathExists(profileDir(newName))) {
    throw new Error(`已存在同名企业："${newName}"`);
  }
  const oldDir = profileDir(oldName);
  if (!(await fs.pathExists(oldDir))) {
    throw new Error(`企业 "${oldName}" 不存在`);
  }
  await fs.rename(oldDir, profileDir(newName));
  const oldMeta = await readMeta(newName);
  const updated: ProfileMeta = { ...oldMeta, name: newName };
  await writeMeta(updated);
  if ((await readCurrentProfile())?.name === oldName) {
    await writeCurrentProfile(updated);
    if (isReady() && getActiveProfileNameSafe() === oldName) {
      setActiveProfileName(newName);
    }
  }
  return updated;
}

export async function updateProfileMeta(
  name: string,
  patch: Partial<Pick<ProfileMeta, "taxId" | "color" | "notes">>,
): Promise<ProfileMeta> {
  const meta = await readMeta(name);
  const next: ProfileMeta = { ...meta };
  if (patch.color !== undefined) next.color = validateColor(patch.color);
  if (patch.taxId !== undefined) next.taxId = patch.taxId.trim() || undefined;
  if (patch.notes !== undefined) next.notes = patch.notes.trim() || undefined;
  await writeMeta(next);
  return next;
}

/**
 * Soft-delete: move the profile directory to `userData/.trash/<name>-<ts>/`.
 * The trash directory is purged on app start (entries older than 30 days).
 */
export async function deleteProfile(name: string): Promise<void> {
  const dir = profileDir(name);
  if (!(await fs.pathExists(dir))) {
    throw new Error(`企业 "${name}" 不存在`);
  }
  const current = await readCurrentProfile();
  if (current?.name === name) {
    throw new Error("不能删除当前正在使用的工作区，请先切换到其他企业");
  }
  await fs.ensureDir(trashRoot());
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.move(dir, path.join(trashRoot(), `${name}-${stamp}`));
}

export async function purgeOldTrash(maxAgeDays = 30): Promise<void> {
  if (!(await fs.pathExists(trashRoot()))) return;
  const entries = await fs.readdir(trashRoot());
  const cutoff = Date.now() - maxAgeDays * 24 * 3600 * 1000;
  for (const entry of entries) {
    const full = path.join(trashRoot(), entry);
    const stat = await fs.stat(full).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) {
      await fs.remove(full).catch(() => undefined);
    }
  }
}

/**
 * Switch the active profile. Throws if the profile doesn't exist.
 * After this call, the next `prisma.*` access opens a new client
 * against the new DB URL.
 */
export async function switchProfile(name: string): Promise<ProfileMeta> {
  if (!(await fs.pathExists(profileMetaPath(name)))) {
    throw new Error(`企业 "${name}" 不存在`);
  }
  const meta = await readMeta(name);
  await writeCurrentProfile(meta);
  setActiveProfileName(name);
  emitActiveProfileChanged(name);
  return meta;
}

function getActiveProfileNameSafe(): string | null {
  try {
    return getActiveProfileName();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Event emitter
// ---------------------------------------------------------------------------
// Listeners get notified when the active profile changes (after switch /
// create / delete). The renderer subscribes via IPC and clears its
// in-memory stores; the main process re-runs the DB bootstrap.

type ProfileChangeListener = (name: string | null) => void;
const listeners = new Set<ProfileChangeListener>();

export function onActiveProfileChanged(listener: ProfileChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitActiveProfileChanged(name: string | null): void {
  for (const l of listeners) {
    try {
      l(name);
    } catch (err) {
      logger.error("[profile] listener threw:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Color picking
// ---------------------------------------------------------------------------

const PALETTE = [
  "#1677ff", "#52c41a", "#722ed1", "#fa8c16", "#13c2c2",
  "#eb2f96", "#fadb14", "#f5222d", "#2f54eb", "#a0d911",
  "#13c2c2", "#fa541c", "#9254de", "#36cfc9", "#ff7a45",
];

export function pickColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] as string;
}

// ---------------------------------------------------------------------------
// Backup (per-profile, called by backup-service)
// ---------------------------------------------------------------------------

export async function exportProfile(name: string, destZipPath: string): Promise<void> {
  const dir = profileDir(name);
  if (!(await fs.pathExists(dir))) {
    throw new Error(`企业 "${name}" 不存在`);
  }
  const archiverMod = (await import("archiver")).default;
  await fs.ensureDir(path.dirname(destZipPath));
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destZipPath);
    const archive = archiverMod("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(dir, name);
    archive.finalize().catch(reject);
  });
}

export async function profileDbFilePath(name: string): Promise<string> {
  return profileDbPath(name);
}

export async function profileRoot(): Promise<string> {
  await fs.ensureDir(profilesRoot());
  return profilesRoot();
}
