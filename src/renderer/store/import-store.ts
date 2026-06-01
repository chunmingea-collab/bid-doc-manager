import { create } from "zustand";
import type {
  ScannedFileType,
  ScanResultType,
  ImportProgressType,
  ImportPhase,
} from "../types/electron.d.ts";

export interface ImportStore {
  phase: ImportPhase;
  scanResult: ScanResultType | null;
  progress: ImportProgressType | null;
  duplicateAction: "overwrite" | "keep_both" | "skip";
  result: { importedCount: number; errorCount: number } | null;
  isPaused: boolean;
  isCancelling: boolean;
  currentTaskId: string | null;

  setPhase: (phase: ImportPhase) => void;
  setScanResult: (result: ScanResultType) => void;
  setProgress: (progress: ImportProgressType) => void;
  setDuplicateAction: (action: "overwrite" | "keep_both" | "skip") => void;
  setResult: (result: { importedCount: number; errorCount: number }) => void;
  setIsPaused: (paused: boolean) => void;
  setIsCancelling: (cancelling: boolean) => void;
  setCurrentTaskId: (id: string | null) => void;
  reset: () => void;
  /** Load the default duplicate-action strategy from user settings. */
  hydrateFromSettings: () => Promise<void>;

  startScan: (folderPath: string) => Promise<void>;
  startScanPaths: (paths: string[]) => Promise<void>;
  startImport: (files: ScannedFileType[]) => Promise<void>;
  pauseImport: () => Promise<void>;
  resumeImport: () => Promise<void>;
  cancelImport: () => Promise<void>;
}

export const useImportStore = create<ImportStore>((set, get) => ({
  phase: "idle",
  scanResult: null,
  progress: null,
  duplicateAction: "keep_both",
  result: null,
  isPaused: false,
  isCancelling: false,
  currentTaskId: null,

  setPhase: (phase) => set({ phase }),
  setScanResult: (scanResult) => set({ scanResult }),
  setProgress: (progress) => set({ progress }),
  setDuplicateAction: (duplicateAction) => set({ duplicateAction }),
  setResult: (result) => set({ result }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setIsCancelling: (isCancelling) => set({ isCancelling }),
  setCurrentTaskId: (currentTaskId) => set({ currentTaskId }),

  hydrateFromSettings: async () => {
    try {
      const settings = await window.electronAPI.getAllSettings();
      if (settings?.duplicateAction) {
        set({ duplicateAction: settings.duplicateAction });
      }
    } catch {
      // ignore — keep default
    }
  },

  reset: () =>
    set({
      phase: "idle",
      scanResult: null,
      progress: null,
      duplicateAction: "keep_both",
      result: null,
      isPaused: false,
      isCancelling: false,
      currentTaskId: null,
    }),

  startScan: async (folderPath) => {
    set({ phase: "scanning", scanResult: null });
    try {
      const result = await window.electronAPI.scanFolder(folderPath);
      set({ scanResult: result, phase: "reviewing" });
    } catch (err) {
      console.error("Scan failed:", err);
      set({ phase: "idle" });
      throw err;
    }
  },

  startScanPaths: async (paths) => {
    set({ phase: "scanning", scanResult: null });
    try {
      const result = await window.electronAPI.scanPaths(paths);
      set({ scanResult: result, phase: "reviewing" });
    } catch (err) {
      console.error("Scan failed:", err);
      set({ phase: "idle" });
      throw err;
    }
  },

  startImport: async (files) => {
    const { duplicateAction } = get();
    set({
      phase: "importing",
      progress: null,
      result: null,
      isPaused: false,
      isCancelling: false,
      currentTaskId: null,
    });

    // Track whether the promise returned before the progress event fired
    let resolved = false;

    const unsubscribe = window.electronAPI.onImportProgress(
      (_event, progress) => {
        if (resolved) return; // promise already resolved, ignore late events
        const p = progress as ImportProgressType;
        set({ progress: p });
        if (p.status === "completed" || p.status === "failed") {
          resolved = true;
          set({ phase: "done", isPaused: false, isCancelling: false });
        }
      },
    );

    try {
      // The IPC returns the taskId synchronously, so pause/cancel work even
      // before the first progress event is delivered.
      const result = await window.electronAPI.startImport(files, duplicateAction);
      if (result?.taskId) {
        set({ currentTaskId: result.taskId });
      }
      if (!resolved) {
        resolved = true;
        set({ result, phase: "done", isPaused: false, isCancelling: false });
      } else {
        set({ result });
      }
    } catch (err) {
      console.error("Import failed:", err);
      if (!resolved) {
        resolved = true;
        set({
          phase: "idle",
          isPaused: false,
          isCancelling: false,
          currentTaskId: null,
        });
      }
    } finally {
      unsubscribe();
    }
  },

  pauseImport: async () => {
    const { currentTaskId } = get();
    if (!currentTaskId) return;
    set({ isPaused: true });
    try {
      const r = await window.electronAPI.pauseImport(currentTaskId);
      if (!r.paused) {
        // Main didn't have the task — might be already done; reflect reality.
        set({ isPaused: false });
      }
    } catch {
      set({ isPaused: false });
    }
  },

  resumeImport: async () => {
    const { currentTaskId } = get();
    if (!currentTaskId) return;
    set({ isPaused: false });
    try {
      const r = await window.electronAPI.resumeImport(currentTaskId);
      if (!r.resumed) {
        set({ isPaused: true });
      }
    } catch {
      set({ isPaused: true });
    }
  },

  cancelImport: async () => {
    const { currentTaskId } = get();
    if (!currentTaskId) return;
    set({ isCancelling: true });
    try {
      await window.electronAPI.cancelImport(currentTaskId);
    } catch {
      // Cancellation is best-effort; the done event will arrive regardless.
    }
  },
}));
