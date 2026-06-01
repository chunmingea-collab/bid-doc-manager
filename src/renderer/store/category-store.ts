import { create } from "zustand";
import type { CategoryRule } from "../../../config/default-categories";

export interface CategoryStore {
  categories: CategoryRule[];
  initialized: boolean;

  initialize: () => Promise<void>;
  addCategory: (category: CategoryRule) => Promise<void>;
  updateCategory: (id: string, updates: Partial<CategoryRule>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  categories: [],
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    const cats = await window.electronAPI.getAllCategories();
    const mapped: CategoryRule[] = cats.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      keywords: c.keywords,
      isCustom: c.isCustom,
    }));
    set({ categories: mapped, initialized: true });
  },

  addCategory: async (category) => {
    await window.electronAPI.createCategory({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      keywords: category.keywords,
      isCustom: category.isCustom,
    });
    set((state) => ({ categories: [...state.categories, category] }));
  },

  updateCategory: async (id, updates) => {
    await window.electronAPI.updateCategory({
      id,
      name: updates.name ?? "",
      parentId: updates.parentId ?? null,
      keywords: updates.keywords ?? [],
    });
    set((state) => ({
      categories: state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  },

  deleteCategory: async (id) => {
    await window.electronAPI.deleteCategory(id);
    set((state) => {
      const toRemove = new Set<string>();
      const collect = (parentId: string) => {
        toRemove.add(parentId);
        state.categories.filter((c) => c.parentId === parentId).forEach((c) => collect(c.id));
      };
      collect(id);
      return { categories: state.categories.filter((c) => !toRemove.has(c.id)) };
    });
  },

  resetToDefaults: async () => {
    await window.electronAPI.resetCategoriesToDefaults();
    set({ initialized: false });
    await get().initialize();
  },
}));