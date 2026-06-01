import { describe, it, expect } from "vitest";
import { normalizeChineseDate, parseExpiryToDate, daysBetween } from "./date";

describe("normalizeChineseDate", () => {
  it("parses ISO YYYY-MM-DD", () => {
    expect(normalizeChineseDate("2026-05-28")).toBe("2026-05-28");
  });

  it("parses YYYY/MM/DD", () => {
    expect(normalizeChineseDate("2026/5/28")).toBe("2026-05-28");
  });

  it("parses YYYY.MM.DD", () => {
    expect(normalizeChineseDate("2026.5.28")).toBe("2026-05-28");
  });

  it("parses Chinese 年月日 with 号", () => {
    expect(normalizeChineseDate("2026年5月28号")).toBe("2026-05-28");
  });

  it("parses Chinese 年月日 with 日", () => {
    expect(normalizeChineseDate("2026年5月28日")).toBe("2026-05-28");
  });

  it("parses Chinese with spaces between tokens", () => {
    expect(normalizeChineseDate("2026 年 5 月 28 日")).toBe("2026-05-28");
  });

  it("pads single-digit months and days to two digits", () => {
    expect(normalizeChineseDate("2026-1-2")).toBe("2026-01-02");
  });

  it("returns null for empty / nullish input", () => {
    expect(normalizeChineseDate(null)).toBeNull();
    expect(normalizeChineseDate(undefined)).toBeNull();
    expect(normalizeChineseDate("")).toBeNull();
  });

  it("returns null for invalid month or day", () => {
    expect(normalizeChineseDate("2026-13-01")).toBeNull();
    expect(normalizeChineseDate("2026-00-10")).toBeNull();
    expect(normalizeChineseDate("2026-05-32")).toBeNull();
  });

  it("returns null for Feb 30 (impossible date)", () => {
    expect(normalizeChineseDate("2026-02-30")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(normalizeChineseDate("not a date")).toBeNull();
    expect(normalizeChineseDate("2026/05")).toBeNull();
  });
});

describe("parseExpiryToDate", () => {
  it("returns null for nullish input", () => {
    expect(parseExpiryToDate(null)).toBeNull();
    expect(parseExpiryToDate(undefined)).toBeNull();
    expect(parseExpiryToDate("")).toBeNull();
  });

  it("parses ISO strings", () => {
    const d = parseExpiryToDate("2026-05-28");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(28);
  });

  it("normalizes Chinese date strings to a Date", () => {
    const d = parseExpiryToDate("2026年5月28日");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(28);
  });

  it("returns null for garbage input", () => {
    expect(parseExpiryToDate("garbage")).toBeNull();
  });
});

describe("daysBetween", () => {
  it("returns 0 for the same instant", () => {
    const now = new Date("2026-05-28T00:00:00Z");
    expect(daysBetween(now, now)).toBe(0);
  });

  it("returns 1 for tomorrow minus today", () => {
    const a = new Date("2026-05-28T00:00:00Z");
    const b = new Date("2026-05-29T00:00:00Z");
    expect(daysBetween(a, b)).toBe(1);
  });

  it("returns negative for past dates", () => {
    const past = new Date("2026-05-27T00:00:00Z");
    const today = new Date("2026-05-28T00:00:00Z");
    expect(daysBetween(today, past)).toBe(-1);
  });

  it("rounds up a partial day", () => {
    const a = new Date("2026-05-28T00:00:00Z");
    const b = new Date("2026-05-28T12:00:00Z");
    expect(daysBetween(a, b)).toBe(1);
  });
});
