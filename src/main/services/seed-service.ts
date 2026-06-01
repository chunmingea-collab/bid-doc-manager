import { prisma } from "../../utils/prisma";
import { DEFAULT_CATEGORIES } from "../../../config/default-categories";
import { logger } from "./logger";

/**
 * Seed default categories into the database on first run.
 * Skips if any category already exists. Called once at startup.
 */
export async function seedCategories(): Promise<void> {
  try {
    const existingCount = await prisma.category.count();
    if (existingCount > 0) {
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
        },
        update: {}, // skip if exists
      });
    }
    logger.info(`[seed] seeded ${DEFAULT_CATEGORIES.length} default categories`);
  } catch (err) {
    logger.error("[seed] Failed to seed categories:", err);
  }
}
