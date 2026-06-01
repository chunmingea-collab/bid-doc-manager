import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Dialog
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  openFile: (filters?: Electron.FileFilter[]) => ipcRenderer.invoke("dialog:openFile", filters),

  // Import
  scanFolder: (folderPath: string) => ipcRenderer.invoke("import:scan", folderPath),
  scanPaths: (paths: string[]) => ipcRenderer.invoke("import:scanPaths", paths),
  startImport: (scannedFiles: unknown[], duplicateAction: string) =>
    ipcRenderer.invoke("import:start", { scannedFiles, duplicateAction }),

  // OCR
  ocrStatus: () => ipcRenderer.invoke("ocr:status"),
  ocrStatusDetail: (refresh = false) => ipcRenderer.invoke("ocr:statusDetail", refresh),

  // Search
  searchDocuments: (filters: Record<string, unknown>, page?: number, pageSize?: number) =>
    ipcRenderer.invoke("search:documents", filters, page, pageSize),

  // Export
  exportToExcel: (payload: { fileIds: string[] }) => ipcRenderer.invoke("export:excel", payload),
  exportDocuments: (payload: { fileIds: string[]; destDir?: string }) =>
    ipcRenderer.invoke("export:zip", payload),

  // Backup
  backupCreate: (destDir?: string) => ipcRenderer.invoke("backup:create", destDir),
  backupRestore: (zipPath: string) => ipcRenderer.invoke("backup:restore", zipPath),
  backupList: (dir?: string) => ipcRenderer.invoke("backup:list", dir),
  backupDelete: (dir: string | undefined, name: string) => ipcRenderer.invoke("backup:delete", dir, name),

  // Reminder
  checkReminders: () => ipcRenderer.invoke("reminder:check"),

  // File operations
  deleteFile: (fileId: string) => ipcRenderer.invoke("file:delete", fileId),
  getFileDetail: (fileId: string) => ipcRenderer.invoke("file:detail", fileId),
  correctText: (fileId: string, correctedText: string) =>
    ipcRenderer.invoke("file:correctText", { fileId, correctedText }),
  readFileBytes: (filePath: string) => ipcRenderer.invoke("file:read", filePath),

  listRecycleBin: () => ipcRenderer.invoke("recycleBin:list"),
  restoreFromRecycleBin: (fileId: string) => ipcRenderer.invoke("recycleBin:restore", fileId),
  purgeFromRecycleBin: (fileId: string) => ipcRenderer.invoke("recycleBin:purge", fileId),
  purgeAllFromRecycleBin: () => ipcRenderer.invoke("recycleBin:purgeAll"),

  // Categories
  getAllCategories: () => ipcRenderer.invoke("category:getAll"),
  createCategory: (data: { id: string; name: string; parentId: string | null; keywords: string[]; isCustom: boolean; color?: string }) =>
    ipcRenderer.invoke("category:create", data),
  updateCategory: (data: { id: string; name?: string; parentId?: string | null; keywords?: string[]; color?: string }) =>
    ipcRenderer.invoke("category:update", data),
  reorderCategories: (orderedIds: string[]) => ipcRenderer.invoke("category:reorder", orderedIds),
  applyCategoryToFiles: (categoryId: string, fileIds: string[]) =>
    ipcRenderer.invoke("category:applyToFiles", { categoryId, fileIds }),
  deleteCategory: (id: string) => ipcRenderer.invoke("category:delete", id),
  resetCategoriesToDefaults: () => ipcRenderer.invoke("category:reset"),
  previewCategoryMatch: (categoryId: string) =>
    ipcRenderer.invoke("category:previewMatch", categoryId),

  // Dashboard
  getDashboardStats: () => ipcRenderer.invoke("dashboard:stats"),
  getRecentActivity: (limit?: number) => ipcRenderer.invoke("dashboard:recent", limit),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (filePath: string) => ipcRenderer.invoke("shell:openPath", filePath),

  // Settings
  getAllSettings: () => ipcRenderer.invoke("settings:getAll"),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke("settings:set", key, value),

  // Notifications
  listNotifications: () => ipcRenderer.invoke("notification:list"),
  checkRemindersNow: () => ipcRenderer.invoke("notification:checkNow"),

  // Progress event listener
  onImportProgress: (callback: (event: unknown, progress: unknown) => void) => {
    ipcRenderer.on("import:progress", callback);
    return () => ipcRenderer.removeListener("import:progress", callback);
  },

  pauseImport: (taskId: string) => ipcRenderer.invoke("import:pause", taskId),
  resumeImport: (taskId: string) => ipcRenderer.invoke("import:resume", taskId),
  cancelImport: (taskId: string) => ipcRenderer.invoke("import:cancel", taskId),
  reprocessFiles: (fileIds: string[]) => ipcRenderer.invoke("import:reprocess", fileIds),
  onReprocessProgress: (callback: (event: unknown, payload: { processed: number; total: number; fileName: string }) => void) => {
    ipcRenderer.on("import:reprocessProgress", callback);
    return () => ipcRenderer.removeListener("import:reprocessProgress", callback);
  },

  onNotification: (callback: (event: unknown, item: unknown) => void) => {
    ipcRenderer.on("notification:new", callback);
    return () => ipcRenderer.removeListener("notification:new", callback);
  },

  onStartupReminder: (callback: (event: unknown, item: unknown) => void) => {
    ipcRenderer.on("notification:startup", callback);
    return () => ipcRenderer.removeListener("notification:startup", callback);
  },

  onNotificationOpen: (callback: (event: unknown, payload: { route: string }) => void) => {
    ipcRenderer.on("notification:open", callback);
    return () => ipcRenderer.removeListener("notification:open", callback);
  },

  onMenuNavigate: (callback: (event: unknown, route: string) => void) => {
    ipcRenderer.on("menu:navigate", callback);
    return () => ipcRenderer.removeListener("menu:navigate", callback);
  },
});
