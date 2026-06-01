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

  setPhase: (phase: ImportPhase) => void;
  setScanResult: (result: ScanResultType) => void;
  setProgress: (progress: ImportProgressType) => void;
  setDuplicateAction: (action: "overwrite" | "keep_both" | "skip") => void;
  setResult: (result: { importedCount: number; errorCount: number }) => void;
  reset: () => void;

  startScan: (folderPath: string) => Promise<void>;
  startImport: (files: ScannedFileType[]) => Promise<void>;
}

export const useImportStore = create<ImportStore>((set, get) => ({
  phase: "idle",
  scanResult: null,
  progress: null,
  duplicateAction: "keep_both",
  result: null,

  setPhase: (phase) => set({ phase }),
  setScanResult: (scanResult) => set({ scanResult }),
  setProgress: (progress) => set({ progress }),
  setDuplicateAction: (duplicateAction) => set({ duplicateAction }),
  setResult: (result) => set({ result }),

  reset: () =>
    set({
      phase: "idle",
      scanResult: null,
      progress: null,
      duplicateAction: "keep_both",
      result: null,
    }),

  startScan: async (folderPath) => {
    set({ phase: "scanning", scanResult: null });
    try {
      const result = await window.electronAPI.scanFolder(folderPath);
      set({ scanResult: result, phase: "reviewing" });
    } catch (err) {
      console.error("Scan failed:", err);
      set({ phase: "idle" });
    }
  },

  startImport: async (files) => {
    const { duplicateAction } = get();
    set({ phase: "importing", progress: null, result: null });

    // Track whether the promise returned before the progress event fired
    let resolved = false;

    const unsubscribe = window.electronAPI.onImportProgress(
      (_event, progress) => {
        if (resolved) return; // promise already resolved, ignore late events
        set({ progress: progress as ImportProgressType });
        if (progress.status === "completed" || progress.status === "failed") {
          resolved = true;
          set({ phase: "done" });
        }
      },
    );

    try {
      const result = await window.electronAPI.startImport(files, duplicateAction);
      if (!resolved) {
        resolved = true;
        set({ result, phase: "done" });
      } else {
        set({ result });
      }
    } catch (err) {
      console.error("Import failed:", err);
      if (!resolved) {
        resolved = true;
        set({ phase: "idle" });
      }
    } finally {
      unsubscribe();
    }
  },
}));
