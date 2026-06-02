import { prisma, isReady as prismaReady } from "../../utils/prisma";
import { logger } from "./logger";

const TRASH_RETENTION_DAYS = 30;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function purgeExpiredTrash(): Promise<number> {
  if (!prismaReady()) return 0;
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.file.deleteMany({
    where: {
      isDeleted: true,
      deletedAt: { lt: cutoff, not: null },
    },
  });
  return result.count;
}

export function scheduleMaintenance(): { stop: () => void } {
  purgeExpiredTrash().catch((err) => {
    logger.error("[maintenance] initial trash purge failed:", err);
  });

  const id = setInterval(() => {
    purgeExpiredTrash()
      .then((n) => {
        if (n > 0) logger.info(`[maintenance] purged ${n} expired soft-deleted files`);
      })
      .catch((err) => logger.error("[maintenance] trash purge failed:", err));
  }, PURGE_INTERVAL_MS);

  return { stop: () => clearInterval(id) };
}
