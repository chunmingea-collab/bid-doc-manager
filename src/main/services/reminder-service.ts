import { prisma } from "../../utils/prisma";
import { parseExpiryToDate } from "../../utils/date";

export interface ExpiringDocument {
  id: string;
  fileName: string;
  expiryDate: string | null;
  companyName: string | null;
  certificateNumber: string | null;
  bucket: 'overdue' | '30days' | '60days' | '90days';
}

/**
 * Query documents whose expiryDate falls within 30 / 60 / 90 days
 * or has already passed. Returns grouped results per bucket.
 */
export async function checkExpiringDocuments(): Promise<{
  overdue: ExpiringDocument[];
  within30Days: ExpiringDocument[];
  within60Days: ExpiringDocument[];
  within90Days: ExpiringDocument[];
}> {
  const now = new Date();
  const daysAhead = (d: number) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + d);
    return dt;
  };

  // Only fetch files expiring within 90 days — skip the rest at the DB level
  const files = await prisma.file.findMany({
    where: {
      isDeleted: false,
      expiryDate: {
        not: null,
        lte: daysAhead(90).toISOString().slice(0, 10),
      },
    },
    select: {
      id: true,
      fileName: true,
      expiryDate: true,
      companyName: true,
      certificateNumber: true,
    },
  });

  const result: ExpiringDocument[] = [];

  for (const file of files) {
    const exp = parseExpiryToDate(file.expiryDate);
    if (!exp) continue;

    let bucket: ExpiringDocument['bucket'] | null = null;

    if (exp < now) {
      bucket = 'overdue';
    } else if (exp <= daysAhead(30)) {
      bucket = '30days';
    } else if (exp <= daysAhead(60)) {
      bucket = '60days';
    } else if (exp <= daysAhead(90)) {
      bucket = '90days';
    }

    if (bucket) {
      result.push({
        id: file.id,
        fileName: file.fileName,
        expiryDate: file.expiryDate,
        companyName: file.companyName,
        certificateNumber: file.certificateNumber,
        bucket,
      });
    }
  }

  return {
    overdue: result.filter((r) => r.bucket === 'overdue'),
    within30Days: result.filter((r) => r.bucket === '30days'),
    within60Days: result.filter((r) => r.bucket === '60days'),
    within90Days: result.filter((r) => r.bucket === '90days'),
  };
}
