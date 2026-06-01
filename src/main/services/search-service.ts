import { prisma } from "../../utils/prisma";
import { logger } from "./logger";

export interface SearchFilters {
  query?: string;
  categoryIds?: string[];
  tagNames?: string[];
  companyName?: string;
  personName?: string;
  certificateNumber?: string;
  fileType?: 'PDF' | 'WORD' | 'EXCEL' | 'IMAGE' | 'OTHER' | '全部';
}

export interface SearchResult {
  file: any;
  score: number;
  matchedFields: string[];
}

const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  PDF: ['.pdf'],
  WORD: ['.doc', '.docx'],
  EXCEL: ['.xls', '.xlsx', '.csv'],
  IMAGE: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff', '.tif'],
};

/**
 * Escape a user query for FTS5 MATCH.
 * Strategy: split on whitespace and CJK punctuation, wrap each non-empty token
 * as a quoted phrase, then AND them. Empty input returns null.
 */
function buildFtsMatchQuery(raw: string): string | null {
  const tokens = raw
    .replace(/["']/g, " ")
    // eslint-disable-next-line no-irregular-whitespace -- U+3000 (ideographic space) is intentional for Chinese tokenization
    .split(/[\s,　、。，；：]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(" AND ");
}

function buildStructuralWhere(filters: SearchFilters, idsHint?: string[]) {
  const { categoryIds, tagNames, companyName, personName, certificateNumber, fileType } = filters;
  const conditions: any[] = [{ isDeleted: false }];

  if (idsHint) {
    conditions.push({ id: { in: idsHint } });
  }

  if (categoryIds?.length) {
    conditions.push({ categoryId: { in: categoryIds } });
  }

  if (fileType && fileType !== '全部') {
    const exts = FILE_TYPE_EXTENSIONS[fileType];
    if (exts) {
      conditions.push({ extension: { in: exts } });
    } else if (fileType === 'OTHER') {
      const known = Object.values(FILE_TYPE_EXTENSIONS).flat();
      conditions.push({ extension: { notIn: known } });
    }
  }

  for (const tag of tagNames ?? []) {
    conditions.push({ tags: { some: { name: tag } } });
  }

  if (companyName) {
    conditions.push({ companyName: { not: null, contains: companyName } });
  }
  if (personName) {
    conditions.push({ personName: { not: null, contains: personName } });
  }
  if (certificateNumber) {
    conditions.push({ certificateNumber: { not: null, contains: certificateNumber } });
  }

  return { AND: conditions };
}

function scoreAndMatchedFields(query: string, file: { fileName: string; extractedText: string; correctedText: string | null; tags: { name: string }[]; category: { name: string } | null }): { score: number; matchedFields: string[] } {
  if (!query) return { score: 0, matchedFields: [] };
  let score = 0;
  const fields: string[] = [];
  const lower = query.toLowerCase();

  const lowerFileName = file.fileName.toLowerCase();
  if (lowerFileName.includes(lower)) { score += 10; fields.push('fileName'); }

  const lowerText = file.extractedText.toLowerCase();
  if (lowerText.includes(lower)) { score += 5; fields.push('extractedText'); }

  if (file.correctedText) {
    const lowerCorrected = file.correctedText.toLowerCase();
    if (lowerCorrected.includes(lower)) { score += 5; fields.push('correctedText'); }
  }

  for (const tag of file.tags) {
    if (tag.name.toLowerCase().includes(lower)) { score += 8; fields.push('tag'); break; }
  }

  if (file.category?.name.toLowerCase().includes(lower)) { score += 7; fields.push('category'); }

  return { score, matchedFields: fields };
}

/**
 * Search documents by file name, content text, tags, categories, and key info fields.
 *
 * When `filters.query` is non-empty, uses SQLite FTS5 (`file_fts` virtual table)
 * to find candidate File ids; structured filters are then applied via Prisma.
 * When `filters.query` is empty, uses Prisma directly with the structured filters.
 */
export async function searchDocuments(
  filters: SearchFilters,
  page = 1,
  pageSize = 20,
): Promise<{ results: SearchResult[]; total: number }> {
  let idsHint: string[] | undefined;

  const queryRaw = filters.query?.trim();
  if (queryRaw) {
    const match = buildFtsMatchQuery(queryRaw);
    if (match) {
      try {
        const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT "id" FROM "file_fts" WHERE "file_fts" MATCH ? LIMIT 5000`,
          match,
        );
        idsHint = rows.map((r) => r.id);
        if (idsHint.length === 0) {
          return { results: [], total: 0 };
        }
      } catch (err) {
        // FTS5 unavailable or malformed query — fall back to LIKE on indexed columns
        logger.warn("[search] FTS5 query failed, falling back to LIKE:", err);
        idsHint = undefined;
      }
    }
  }

  const where = idsHint
    ? buildStructuralWhere(filters, idsHint)
    : queryRaw
      ? {
          AND: [
            buildStructuralWhere(filters),
            {
              OR: [
                { fileName: { contains: queryRaw } },
                { extractedText: { contains: queryRaw } },
                { correctedText: { not: null, contains: queryRaw } },
              ],
            },
          ],
        }
      : buildStructuralWhere(filters);

  const [total, files] = await Promise.all([
    prisma.file.count({ where }),
    prisma.file.findMany({
      where,
      include: { tags: true, category: true },
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const results: SearchResult[] = files.map((file: any) => {
    const { score, matchedFields } = scoreAndMatchedFields(queryRaw ?? '', file);
    return { file, score, matchedFields };
  });

  results.sort((a, b) => b.score - a.score);

  return { results, total };
}
