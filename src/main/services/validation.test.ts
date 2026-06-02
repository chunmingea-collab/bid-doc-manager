import { describe, it, expect } from "vitest";
import {
  validateReorderInput,
  validateApplyToFilesInput,
  validateBackupDeleteInput,
} from "./validation";

describe("validateReorderInput", () => {
  it("accepts a non-empty string array", () => {
    const out = validateReorderInput({ orderedIds: ["a", "b", "c"] });
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("throws when not an array", () => {
    expect(() => validateReorderInput({ orderedIds: "abc" })).toThrow(/must be an array/);
    expect(() => validateReorderInput({ orderedIds: null })).toThrow(/must be an array/);
    expect(() => validateReorderInput({ orderedIds: { 0: "a" } })).toThrow(/must be an array/);
  });

  it("throws on empty array", () => {
    expect(() => validateReorderInput({ orderedIds: [] })).toThrow(/must not be empty/);
  });

  it("throws when array contains empty strings", () => {
    expect(() => validateReorderInput({ orderedIds: ["a", ""] })).toThrow(/non-empty strings/);
  });

  it("throws when array contains non-strings", () => {
    expect(() => validateReorderInput({ orderedIds: ["a", 1] })).toThrow(/non-empty strings/);
  });
});

describe("validateApplyToFilesInput", () => {
  it("accepts a valid payload", () => {
    const out = validateApplyToFilesInput({ categoryId: "qual", fileIds: ["f1", "f2"] });
    expect(out).toEqual({ categoryId: "qual", fileIds: ["f1", "f2"] });
  });

  it("throws when categoryId is missing", () => {
    expect(() => validateApplyToFilesInput({ categoryId: "", fileIds: ["f1"] })).toThrow(/categoryId/);
    expect(() => validateApplyToFilesInput({ categoryId: 42, fileIds: ["f1"] })).toThrow(/categoryId/);
  });

  it("throws when fileIds is empty", () => {
    expect(() => validateApplyToFilesInput({ categoryId: "qual", fileIds: [] })).toThrow(/fileIds/);
    expect(() => validateApplyToFilesInput({ categoryId: "qual", fileIds: "f1" })).toThrow(/fileIds/);
  });
});

describe("validateBackupDeleteInput", () => {
  it("accepts a valid zip filename", () => {
    const out = validateBackupDeleteInput({
      dir: "C:/backups",
      name: "bid-manager-backup-2026-01-01T10-00-00.zip",
    });
    expect(out.name).toBe("bid-manager-backup-2026-01-01T10-00-00.zip");
  });

  it("rejects filenames that don't start with the prefix", () => {
    expect(() => validateBackupDeleteInput({ dir: "x", name: "evil.zip" })).toThrow(/非法的备份文件名/);
  });

  it("rejects non-zip extensions", () => {
    expect(() => validateBackupDeleteInput({ dir: "x", name: "bid-manager-backup-x.exe" })).toThrow(/非法的备份文件名/);
  });

  it("rejects path traversal attempts in the filename", () => {
    // Our regex requires the name to start with the prefix, so ../ is rejected
    // outright — even before the file system layer would get a chance.
    expect(() => validateBackupDeleteInput({ dir: "x", name: "../etc/passwd" })).toThrow(/非法的备份文件名/);
    expect(() => validateBackupDeleteInput({ dir: "x", name: "bid-manager-backup-../../etc/passwd.zip" })).toThrow();
  });
});
