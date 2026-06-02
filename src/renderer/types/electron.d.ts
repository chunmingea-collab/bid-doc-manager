// Electron API type definitions for renderer process

// Scanned file type matching the IPC interface
export interface ScannedFileType {
  path: string;
  fileName: string;
  extension: string;
  size: number;
  md5: string;
}

export interface ScanResultType {
  files: ScannedFileType[];
  totalSize: number;
  skippedCount: number;
  skippedReasons: Array<{ path: string; reason: string }>;
}

export interface ImportProgressType {
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

export type ImportPhase = "idle" | "scanning" | "reviewing" | "importing" | "done";

export interface DashboardStats {
  totalCount: number;
  thisMonthCount: number;
  errorCount: number;
  expiringCount: number;
}

export interface KeyInfoFields {
  certificateNumber: string;
  companyName: string;
  personName: string;
  qualificationLevel: string;
  expiryDate: string;
}

export interface FileDetail {
  id: string;
  fileName: string;
  originalPath: string;
  extension: string;
  size: number;
  extractedText: string;
  correctedText: string | null;
  certificateNumber: string | null;
  companyName: string | null;
  personName: string | null;
  qualificationLevel: string | null;
  expiryDate: string | null;
  importStatus: string;
  importError: string | null;
  categoryId: string | null;
  categoryName: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecentActivity {
  id: string;
  fileName: string;
  category: string | null;
  importStatus: string;
  createdAt: string;
}

export interface RecycleBinItem {
  id: string;
  fileName: string;
  extension: string;
  originalPath: string;
  size: number;
  deletedAt: string;
}

export interface CategoryRuleType {
  id: string;
  name: string;
  parentId: string | null;
  keywords: string[];
  isCustom: boolean;
  sortOrder: number;
  color: string;
}

export interface AppSettings {
  reminderDays: number[];
  reminderEnabled: boolean;
  reminderHour: number;
  startupReminderEnabled: boolean;
  importMaxFileSizeMb: number;
  importConcurrency: number;
  duplicateAction: "overwrite" | "keep_both" | "skip";
  autoBackupOnQuit: boolean;
  autoBackupCadence: "off" | "daily" | "weekly" | "onQuit";
  autoBackupKeep: number;
  autoBackupDir: string;
  lastReminderShownDate: string;
  lastBackupAt: string;
  lastBackupPath: string;
}

export type SettingKey = keyof AppSettings;

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  bucket: "overdue" | "30days" | "60days" | "90days";
  count: number;
  firedAt: string;
}

export interface OcrStatusDetail {
  available: boolean;
  runnerPath: string | null;
  detModelPath: string | null;
  recModelPath: string | null;
  version?: string;
  error?: string;
}

export interface ElectronAPI {
  // Dialog
  openDirectory: () => Promise<string | null>;
  openFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;

  // Import
  scanFolder: (folderPath: string) => Promise<ScanResultType>;
  scanPaths: (paths: string[]) => Promise<ScanResultType>;
  startImport: (
    scannedFiles: ScannedFileType[],
    duplicateAction: "skip" | "overwrite" | "keep_both",
  ) => Promise<{ taskId: string; importedCount: number; errorCount: number }>;

  // OCR
  ocrStatus: () => Promise<boolean>;
  ocrStatusDetail: (refresh?: boolean) => Promise<OcrStatusDetail>;

  // Search
  searchDocuments: (
    filters: Record<string, unknown>,
    page?: number,
    pageSize?: number,
  ) => Promise<{ results: Array<{ file: Record<string, unknown>; score: number; matchedFields: string[] }>; total: number }>;

  // Export
  exportToExcel: (payload: { fileIds: string[] }) => Promise<{ filePath: string; count: number }>;
  exportDocuments: (payload: { fileIds: string[]; destDir?: string }) => Promise<{ filePath: string; count: number; success: string[]; failed: Array<{ originalPath: string; error: string }> }>;

  // Backup
  backupCreate: (destDir?: string) => Promise<{ filePath: string; timestamp: string }>;
  backupRestore: (zipPath: string) => Promise<{ success: boolean }>;
  backupList: (dir?: string) => Promise<{ name: string; size: number; mtime: number }[]>;
  backupDelete: (dir: string | undefined, name: string) => Promise<{ success: boolean }>;

  // Reminder
  checkReminders: () => Promise<{
    overdue: Array<{ id: string; fileName: string; expireDate: string; companyName: string; certificateNumber: string; daysLeft: number; bucket: "overdue" }>;
    within30Days: Array<{ id: string; fileName: string; expireDate: string; companyName: string; certificateNumber: string; daysLeft: number; bucket: "30days" }>;
    within60Days: Array<{ id: string; fileName: string; expireDate: string; companyName: string; certificateNumber: string; daysLeft: number; bucket: "60days" }>;
    within90Days: Array<{ id: string; fileName: string; expireDate: string; companyName: string; certificateNumber: string; daysLeft: number; bucket: "90days" }>;
  }>;

  // File operations
  deleteFile: (fileId: string) => Promise<{ success: boolean }>;
  correctText: (
    fileId: string,
    correctedText: string,
  ) => Promise<{ success: boolean; categoryId: string | null; keyInfo: KeyInfoFields }>;
  getFileDetail: (fileId: string) => Promise<FileDetail | null>;
  readFileBytes: (filePath: string) => Promise<{ bytes: number[]; mime: string }>;

  // Recycle bin
  listRecycleBin: () => Promise<RecycleBinItem[]>;
  restoreFromRecycleBin: (fileId: string) => Promise<{ success: boolean }>;
  purgeFromRecycleBin: (fileId: string) => Promise<{ success: boolean }>;
  purgeAllFromRecycleBin: () => Promise<{ purged: number }>;

  // Categories
  getAllCategories: () => Promise<CategoryRuleType[]>;
  createCategory: (data: { id: string; name: string; parentId: string | null; keywords: string[]; isCustom: boolean; color?: string }) => Promise<{ id: string; name: string; color: string }>;
  updateCategory: (data: { id: string; name?: string; parentId?: string | null; keywords?: string[]; color?: string }) => Promise<{ success: boolean }>;
  reorderCategories: (orderedIds: string[]) => Promise<{ success: boolean }>;
  applyCategoryToFiles: (categoryId: string, fileIds: string[]) => Promise<{ updated: number }>;
  deleteCategory: (id: string) => Promise<{ success: boolean }>;
  resetCategoriesToDefaults: () => Promise<{ success: boolean }>;
  previewCategoryMatch: (categoryId: string) => Promise<{
    totalFiles: number;
    matchedCount: number;
    sample: Array<{ id: string; fileName: string }>;
  }>;

  // Dashboard
  getDashboardStats: () => Promise<DashboardStats>;
  getRecentActivity: (limit?: number) => Promise<RecentActivity[]>;

  // Shell
  openExternal: (url: string) => Promise<void>;
  openPath: (filePath: string) => Promise<void>;

  // Settings
  getAllSettings: () => Promise<AppSettings>;
  setSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) => Promise<{ success: boolean }>;

  // Notifications
  listNotifications: () => Promise<NotificationItem[]>;
  checkRemindersNow: () => Promise<NotificationItem[]>;

  // Event listeners
  onImportProgress: (callback: (event: unknown, progress: ImportProgressType) => void) => () => void;
  pauseImport: (taskId: string) => Promise<{ paused: boolean }>;
  resumeImport: (taskId: string) => Promise<{ resumed: boolean }>;
  cancelImport: (taskId: string) => Promise<{ cancelled: boolean }>;
  reprocessFiles: (fileIds: string[]) => Promise<{
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    results: Array<{ fileId: string; fileName: string; status: "completed" | "error" | "skipped"; error?: string }>;
  }>;
  onReprocessProgress: (
    callback: (event: unknown, payload: { processed: number; total: number; fileName: string }) => void
  ) => () => void;
  onNotification: (callback: (event: unknown, item: NotificationItem) => void) => () => void;
  onStartupReminder: (callback: (event: unknown, item: NotificationItem) => void) => () => void;
  onNotificationOpen: (callback: (event: unknown, payload: { route: string }) => void) => () => void;
  onMenuNavigate: (callback: (event: unknown, route: string) => void) => () => void;

  // Profile (multi-enterprise workspaces)
  listProfiles: () => Promise<ProfileMeta[]>;
  getActiveProfile: () => Promise<ProfileMeta | null>;
  createProfile: (input: { name: string; taxId?: string; color?: string; notes?: string }) => Promise<ProfileMeta>;
  renameProfile: (oldName: string, newName: string) => Promise<ProfileMeta>;
  updateProfileMeta: (input: { name: string; taxId?: string; color?: string; notes?: string }) => Promise<ProfileMeta>;
  deleteProfile: (name: string) => Promise<{ success: boolean }>;
  switchProfile: (name: string) => Promise<ProfileMeta>;
  exportProfile: (name: string) => Promise<{ canceled: boolean; filePath?: string }>;
  onProfileChanged: (callback: (event: unknown, payload: { name: string | null }) => void) => () => void;
}

export interface ProfileMeta {
  id: string;
  name: string;
  taxId?: string;
  color: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  sizeBytes: number;
  fileCount: number;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
