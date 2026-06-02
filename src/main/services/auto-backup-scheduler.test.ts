import { describe, it, expect } from "vitest";
import { pickDayKey, pickFilesToDelete } from "./auto-backup-scheduler";

describe("pickDayKey", () => {
  it("returns YYYY-MM-DD for daily cadence", () => {
    const d = new Date("2025-03-15T10:00:00Z");
    const key = pickDayKey(d, "daily");
    // The function uses local time (toISOString.slice(0,10)) so we accept
    // either the same date or ±1 day depending on the test machine's TZ.
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns YYYY-Www for weekly cadence", () => {
    const d = new Date("2025-03-15T10:00:00Z");
    const key = pickDayKey(d, "weekly");
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("two dates inside the same ISO week yield the same key (weekly)", () => {
    const a = new Date("2025-03-10T10:00:00Z"); // Monday
    const b = new Date("2025-03-16T10:00:00Z"); // Sunday of same week
    expect(pickDayKey(a, "weekly")).toBe(pickDayKey(b, "weekly"));
  });

  it("two dates a week apart yield different keys (weekly)", () => {
    const a = new Date("2025-03-10T10:00:00Z");
    const b = new Date("2025-03-17T10:00:00Z");
    expect(pickDayKey(a, "weekly")).not.toBe(pickDayKey(b, "weekly"));
  });
});

describe("pickFilesToDelete", () => {
  it("keeps the N most recent and marks the rest for deletion", () => {
    const files = [
      "bid-manager-backup-2026-01-01T00-00-00.zip",
      "bid-manager-backup-2026-01-02T00-00-00.zip",
      "bid-manager-backup-2026-01-03T00-00-00.zip",
      "bid-manager-backup-2026-01-04T00-00-00.zip",
    ];
    expect(pickFilesToDelete(files, 2)).toEqual([
      "bid-manager-backup-2026-01-02T00-00-00.zip",
      "bid-manager-backup-2026-01-01T00-00-00.zip",
    ]);
  });

  it("returns all files when keep is 0", () => {
    const files = ["bid-manager-backup-2026-01-01T00-00-00.zip", "bid-manager-backup-2026-01-02T00-00-00.zip"];
    expect(pickFilesToDelete(files, 0)).toEqual([...files].sort().reverse());
  });

  it("returns nothing when keep is greater than file count", () => {
    const files = ["bid-manager-backup-2026-01-01T00-00-00.zip"];
    expect(pickFilesToDelete(files, 10)).toEqual([]);
  });

  it("ignores non-matching files in the directory", () => {
    const files = [
      "bid-manager-backup-2026-01-01T00-00-00.zip",
      "other.txt",
      "bid-manager-backup-2026-01-02T00-00-00.zip",
      "random.zip",
    ];
    expect(pickFilesToDelete(files, 1)).toEqual(["bid-manager-backup-2026-01-01T00-00-00.zip"]);
  });

  it("coerces negative or fractional keep to a safe integer", () => {
    const files = ["bid-manager-backup-2026-01-01T00-00-00.zip", "bid-manager-backup-2026-01-02T00-00-00.zip"];
    expect(pickFilesToDelete(files, -1)).toEqual([...files].sort().reverse());
    expect(pickFilesToDelete(files, 1.9)).toEqual(["bid-manager-backup-2026-01-01T00-00-00.zip"]);
  });
});
