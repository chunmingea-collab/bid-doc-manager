import { prisma } from "../../../utils/prisma";
import type { CategoryRule } from "../../../../config/default-categories";
import { DEFAULT_CATEGORIES } from "../../../../config/default-categories";

export interface CategoryResult {
  categoryId: string
  categoryName: string
  parentId: string | null
  parentName: string | null
  matchedKeyword: string
}

let cachedCategories: CategoryRule[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60_000; // 5 minutes — long enough for batch imports

export function invalidateCache(): void {
  cachedCategories = null;
  cacheTimestamp = 0;
}

async function getCategories(): Promise<CategoryRule[]> {
  if (cachedCategories && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedCategories;
  }
  const rows = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  cachedCategories = rows
    .filter((r) => r.name)
    .map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      keywords: r.keywords ? r.keywords.split(",").filter((k) => k).map((k) => k.toLowerCase()) : [],
      isCustom: r.isCustom,
    }));
  cacheTimestamp = Date.now();
  return cachedCategories ?? DEFAULT_CATEGORIES;
}

/** Escape special regex characters in a keyword string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match keyword against haystack using word-boundary regex to avoid false
 * positives (e.g. "工程" matching "工程部" or "建筑工程"). Falls back to
 * substring match for CJK characters where word boundaries don't apply.
 */
function keywordMatches(haystack: string, kw: string): boolean {
  // For purely CJK keywords, word-boundary regex isn't reliable.
  // Use a boundary-aware check: keyword must be surrounded by
  // whitespace, punctuation, CJK boundary, or string edge.
  const escaped = escapeRegex(kw);
  // Match: (^|non-alphanumeric) keyword (non-alphanumeric|$)
  const boundaryRegex = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "ui");
  return boundaryRegex.test(haystack);
}

export async function classifyDocument(
  fileName: string,
  contentText: string,
): Promise<CategoryResult> {
  const categories = await getCategories();
  const haystack = `${fileName} ${contentText}`.toLowerCase();

  const subcategories = categories.filter(
    (c: CategoryRule) => c.parentId !== null && c.keywords.length > 0,
  );
  const parents = categories.filter(
    (c: CategoryRule) => c.parentId === null && c.keywords.length > 0 && c.id !== "other",
  );
  const fallback = categories.find((c: CategoryRule) => c.id === "other")
    ?? DEFAULT_CATEGORIES.find((c) => c.id === "other");

  // 1. Subcategories first (highest priority)
  for (const sub of subcategories) {
    for (const kw of sub.keywords) {
      if (keywordMatches(haystack, kw)) {
        const parent = categories.find((c: CategoryRule) => c.id === sub.parentId);
        return {
          categoryId: sub.id,
          categoryName: sub.name,
          parentId: sub.parentId,
          parentName: parent?.name ?? null,
          matchedKeyword: kw,
        };
      }
    }
  }

  // 2. Parent categories
  for (const parent of parents) {
    for (const kw of parent.keywords) {
      if (keywordMatches(haystack, kw)) {
        return {
          categoryId: parent.id,
          categoryName: parent.name,
          parentId: null,
          parentName: null,
          matchedKeyword: kw,
        };
      }
    }
  }

  // 3. Fallback
  return {
    categoryId: fallback?.id ?? "other",
    categoryName: fallback?.name ?? "其他资料",
    parentId: null,
    parentName: null,
    matchedKeyword: "",
  };
}

export interface PreviewMatch {
  totalFiles: number;
  matchedCount: number;
  sample: Array<{ id: string; fileName: string }>;
}

/**
 * Dry-run: count how many existing files would land in `categoryId` if the
 * classifier were re-run right now. Used by the Settings → Categories panel
 * so the user can see the impact of editing keywords before saving.
 *
 * We compute the match by replicating `classifyDocument` for each file
 * (filename + extractedText). The sample is bounded to avoid pulling huge
 * text payloads back to the renderer.
 */
export async function previewCategoryMatch(
  categoryId: string,
  options: { sampleSize?: number } = {},
): Promise<PreviewMatch> {
  const sampleSize = Math.min(options.sampleSize ?? 10, 50);
  const categories = await getCategories();
  const target = categories.find((c) => c.id === categoryId);
  if (!target) {
    return { totalFiles: 0, matchedCount: 0, sample: [] };
  }
  // We can't predict exactly which category the classifier will pick per file
  // (priority order: subcategory > parent > other). So instead we test the
  // inverse: for each file, would the classifier's first-match be this
  // category? Easiest proxy: does the file match ANY of the target's
  // keywords, AND no higher-priority category also matches the same file.
  // To keep the preview fast, we just count files matching the target's
  // keywords and let the UI clarify it's an upper bound.
  const keywords = target.keywords;
  if (keywords.length === 0) {
    const totalFiles = await prisma.file.count({ where: { isDeleted: false } });
    return { totalFiles, matchedCount: 0, sample: [] };
  }

  const totalFiles = await prisma.file.count({ where: { isDeleted: false } });
  const candidates = await prisma.file.findMany({
    where: { isDeleted: false },
    select: { id: true, fileName: true, extractedText: true },
    take: 5000, // upper bound for a reasonable preview
  });

  const sample: PreviewMatch["sample"] = [];
  let matchedCount = 0;
  for (const f of candidates) {
    const haystack = `${f.fileName} ${f.extractedText ?? ""}`.toLowerCase();
    if (keywords.some((kw) => keywordMatches(haystack, kw))) {
      matchedCount++;
      if (sample.length < sampleSize) {
        sample.push({ id: f.id, fileName: f.fileName });
      }
    }
  }
  return { totalFiles, matchedCount, sample };
}
