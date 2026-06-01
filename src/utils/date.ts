/**
 * Parses any of the date formats produced by `extractKeyInfo` and returns
 * an ISO date string (YYYY-MM-DD) — or null if the input cannot be parsed.
 *
 * Accepted inputs:
 *   2026-05-28        2026/5/28        2026.5.28
 *   2026年5月28日     2026年5月28号    2026 年 5 月 28 日
 */
export function normalizeChineseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/\s+/g, "");
  const match = cleaned.match(/^(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})[日号]?$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parse an already-stored expiry value (ISO or legacy) into a Date. */
export function parseExpiryToDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const iso = normalizeChineseDate(raw);
  const candidate = iso ?? raw;
  const dt = new Date(candidate);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Whole days between `from` and `to`, rounded toward zero (negative if `to` is past). */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
