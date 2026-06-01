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

export interface CategoryRuleType {
  id: string;
  name: string;
  parentId: string | null;
  keywords: string[];
  isCustom: boolean;
  sortOrder: number;
}

export interface AppSettings {
  reminderDays: number[];
  reminderEnabled: boolean;
  reminderHour: number;
  startupReminderEnabled: boolean;
  importMaxFileSizeMb: number;
  importConcurrency: number;
  autoBackupOnQuit: boolean;
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

  // Reminder
  checkReminders: () => Promise<{
    overdue: Array<{ id: string; fileName: string; expireDate: string; companyName: string; certificateNumber: string; daysLeft: number; bucket: "overdue" }>;
    within30Days: Array<{ id: string; fileName: string; expireDate: string; companyName: string; certificateNumber: string; daysLeft: number; bucket: "30days" }>;
    within60Days: Array<{ id: string; fileName: string; expireDate: string; companyName: string; certificateNumber: string; daysLeft: number; bucket: "60days" }>;
    within90Days: Array<{ id: string; fileName: string; expireDate: string; companyName: string; certificateNumber: string; daysLeft: number; bucket: "90days" }>;
  }>;

  // File operations
  deleteFile: (fileId: string) => Promise<{ success: boolean }>;
  correctText: (fileId: string, correctedText: string) => Promise<{ success: boolean }>;

  // Categories
  getAllCategories: () => Promise<CategoryRuleType[]>;
  createCategory: (data: { id: string; name: string; parentId: string | null; keywords: string[]; isCustom: boolean }) => Promise<{ id: string; name: string }>;
  updateCategory: (data: { id: string; name: string; parentId: string | null; keywords: string[] }) => Promise<{ success: boolean }>;
  deleteCategory: (id: string) => Promise<{ success: boolean }>;
  resetCategoriesToDefaults: () => Promise<{ success: boolean }>;

  // Dashboard
  getDashboardStats: () => Promise<DashboardStats>;

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
  onNotification: (callback: (event: unknown, item: NotificationItem) => void) => () => void;
  onStartupReminder: (callback: (event: unknown, item: NotificationItem) => void) => () => void;
  onNotificationOpen: (callback: (event: unknown, payload: { route: string }) => void) => () => void;
  onMenuNavigate: (callback: (event: unknown, route: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
