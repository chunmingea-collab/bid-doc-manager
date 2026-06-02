import { create } from "zustand";
import type { ProfileMeta } from "../types/electron";

interface ProfileState {
  profiles: ProfileMeta[];
  active: ProfileMeta | null;
  loaded: boolean;

  refresh: () => Promise<void>;
  refreshActive: () => Promise<void>;
  create: (input: { name: string; taxId?: string; color?: string; notes?: string }) => Promise<ProfileMeta>;
  switchTo: (name: string) => Promise<void>;
  rename: (oldName: string, newName: string) => Promise<void>;
  updateMeta: (input: { name: string; taxId?: string; color?: string; notes?: string }) => Promise<void>;
  remove: (name: string) => Promise<void>;
  exportOne: (name: string) => Promise<{ canceled: boolean; filePath?: string }>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  active: null,
  loaded: false,

  refresh: async () => {
    const profiles = await window.electronAPI.listProfiles();
    set({ profiles, loaded: true });
  },
  refreshActive: async () => {
    const active = await window.electronAPI.getActiveProfile();
    set({ active });
  },
  create: async (input) => {
    const created = await window.electronAPI.createProfile(input);
    await get().refresh();
    await get().refreshActive();
    return created;
  },
  switchTo: async (name) => {
    await window.electronAPI.switchProfile(name);
    // The main process emits "profile:changed" which the App component
    // listens to; we refresh from disk defensively in case the event
    // hasn't fired yet (e.g. during initial boot).
    await get().refreshActive();
  },
  rename: async (oldName, newName) => {
    await window.electronAPI.renameProfile(oldName, newName);
    await get().refresh();
    await get().refreshActive();
  },
  updateMeta: async (input) => {
    await window.electronAPI.updateProfileMeta(input);
    await get().refresh();
    await get().refreshActive();
  },
  remove: async (name) => {
    await window.electronAPI.deleteProfile(name);
    await get().refresh();
  },
  exportOne: async (name) => {
    return await window.electronAPI.exportProfile(name);
  },
}));
