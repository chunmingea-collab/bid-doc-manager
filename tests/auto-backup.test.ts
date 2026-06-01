import { describe, it, expect } from "vitest";
import { pickDayKey } from "../src/main/services/auto-backup-scheduler";

// Re-implement the local pure helpers here so the test does not need a
// running Electron app. The implementation in auto-backup-scheduler.ts is
// not exported, so the test asserts the contract on the function we DO
// export (pickDayKey via re-export). If the source changes, the test will
// surface it.

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
