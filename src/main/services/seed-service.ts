import { prisma } from "../../utils/prisma";
import { DEFAULT_CATEGORIES } from "../../../config/default-categories";
import { logger } from "./logger";

/**
 * Hand-picked color for each built-in category. Order follows the
 * `DEFAULT_CATEGORIES` array and uses Antd's preset palette so the
 * colors look at home in both light and dark themes.
 */
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  // top-level
  qualification: "#1677ff",
  basics: "#52c41a",
  personnel: "#722ed1",
  performance: "#fa8c16",
  finance: "#13c2c2",
  certification: "#eb2f96",
  intellectual: "#fadb14",
  other: "#bfbfbf",
  // subcategories — fall back to the parent color if unspecified
  "qual-main": "#1677ff",
  "qual-additional": "#4096ff",
  "qual-specialty": "#69b1ff",
  "basics-license": "#52c41a",
  "basics-organization": "#73d13d",
  "basics-identity": "#95de64",
  "personnel-registered": "#722ed1",
  "personnel-senior": "#9254de",
  "personnel-title": "#b37feb",
  "performance-contract": "#fa8c16",
  "performance-evaluation": "#ffa940",
  "performance-customer": "#ffc069",
  "finance-audit": "#13c2c2",
  "finance-bank": "#36cfc9",
  "finance-tax": "#5cdbd3",
  "cert-quality": "#eb2f96",
  "cert-environment": "#f759ab",
  "cert-safety": "#ff85c0",
  "ip-patent": "#fadb14",
  "ip-trademark": "#ffd666",
  "ip-copyright": "#ffe58f",
};

function colorFor(id: string): string {
  return DEFAULT_CATEGORY_COLORS[id] ?? "#1677ff";
}

/**
 * Seed default categories into the database on first run.
 * Skips if any category already exists. Called once at startup.
 */
export async function seedCategories(): Promise<void> {
  try {
    const existingCount = await prisma.category.count();
    if (existingCount > 0) {
      // Backfill color for pre-color rows (e.g. existing user DBs that
      // pre-date P2-T15). New column already has DEFAULT '#1677ff' from
      // the migration; we just need to apply the curated palette on top.
      for (const cat of DEFAULT_CATEGORIES) {
        await prisma.category.updateMany({
          where: { id: cat.id, color: "#1677ff" },
          data: { color: colorFor(cat.id) },
        });
      }
      return;
    }

    for (const cat of DEFAULT_CATEGORIES) {
      await prisma.category.upsert({
        where: { id: cat.id },
        create: {
          id: cat.id,
          name: cat.name,
          parentId: cat.parentId,
          keywords: cat.keywords.join(","),
          isCustom: cat.isCustom,
          sortOrder: 0,
          color: colorFor(cat.id),
        },
        update: {}, // skip if exists
      });
    }
    logger.info(`[seed] seeded ${DEFAULT_CATEGORIES.length} default categories`);
  } catch (err) {
    logger.error("[seed] Failed to seed categories:", err);
  }
}
