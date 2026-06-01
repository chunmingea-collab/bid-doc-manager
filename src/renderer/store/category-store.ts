import { create } from "zustand";
import type { CategoryRule } from "../../../config/default-categories";

export interface CategoryRuleWithColor extends CategoryRule {
  color: string;
  sortOrder: number;
}

export interface CategoryStore {
  categories: CategoryRuleWithColor[];
  initialized: boolean;

  initialize: () => Promise<void>;
  addCategory: (category: Omit<CategoryRuleWithColor, "sortOrder">) => Promise<void>;
  updateCategory: (id: string, updates: Partial<CategoryRuleWithColor>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  reorderCategories: (orderedIds: string[]) => Promise<void>;
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  categories: [],
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    const cats = await window.electronAPI.getAllCategories();
    const mapped: CategoryRuleWithColor[] = cats.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      keywords: c.keywords,
      isCustom: c.isCustom,
      color: c.color || "#1677ff",
      sortOrder: c.sortOrder ?? 0,
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
      color: category.color,
    });
    set((state) => ({
      categories: [
        ...state.categories,
        { ...category, sortOrder: state.categories.length },
      ],
    }));
  },

  updateCategory: async (id, updates) => {
    // Only send defined fields; the IPC handler treats undefined as "leave alone".
    const payload: { id: string; name?: string; parentId?: string | null; keywords?: string[]; color?: string } = { id };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.parentId !== undefined) payload.parentId = updates.parentId;
    if (updates.keywords !== undefined) payload.keywords = updates.keywords;
    if (updates.color !== undefined) payload.color = updates.color;
    await window.electronAPI.updateCategory(payload);
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

  reorderCategories: async (orderedIds) => {
    await window.electronAPI.reorderCategories(orderedIds);
    // Optimistic local re-sort by index, so the UI doesn't flicker.
    set((state) => {
      const indexOf = new Map(orderedIds.map((id, idx) => [id, idx]));
      return {
        categories: state.categories
          .map((c) => ({ ...c, sortOrder: indexOf.get(c.id) ?? c.sortOrder }))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      };
    });
  },
}));
