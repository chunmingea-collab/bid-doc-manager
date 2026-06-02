import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fse from "fs-extra";
import path from "path";
import os from "os";
import { scanPaths } from "./index";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), "bid-doc-scanpaths-"));
});

afterEach(async () => {
  await fse.remove(tmpDir).catch(() => null);
});

describe("scanPaths", () => {
  it("returns an empty result for an empty input list", async () => {
    const result = await scanPaths([]);
    expect(result.files).toEqual([]);
    expect(result.totalSize).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it("scans a single file", async () => {
    const filePath = path.join(tmpDir, "doc.pdf");
    // PDF magic bytes so a real workflow wouldn't reject it on parse
    await fse.writeFile(filePath, Buffer.from("%PDF-1.4\n%fake test content"));

    const result = await scanPaths([filePath]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].fileName).toBe("doc.pdf");
    expect(result.skippedCount).toBe(0);
  });

  it("scans a directory recursively", async () => {
    const sub = path.join(tmpDir, "sub");
    await fse.ensureDir(sub);
    await fse.writeFile(path.join(tmpDir, "a.pdf"), Buffer.from("%PDF-1.4\na"));
    await fse.writeFile(path.join(sub, "b.pdf"), Buffer.from("%PDF-1.4\nb"));

    const result = await scanPaths([tmpDir]);
    expect(result.files).toHaveLength(2);
    const names = result.files.map((f) => f.fileName).sort();
    expect(names).toEqual(["a.pdf", "b.pdf"]);
  });

  it("deduplicates by MD5", async () => {
    const f1 = path.join(tmpDir, "a.pdf");
    const f2 = path.join(tmpDir, "b.pdf");
    const same = Buffer.from("%PDF-1.4\nidentical content");
    await fse.writeFile(f1, same);
    await fse.writeFile(f2, same);

    const result = await scanPaths([f1, f2]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].md5).toMatch(/^[0-9a-f]{32}$/);
  });

  it("skips unsupported extensions", async () => {
    const ok = path.join(tmpDir, "ok.pdf");
    const bad = path.join(tmpDir, "bad.xyz");
    await fse.writeFile(ok, Buffer.from("%PDF-1.4\nok"));
    await fse.writeFile(bad, "x");

    const result = await scanPaths([ok, bad]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].fileName).toBe("ok.pdf");
    expect(result.skippedCount).toBe(1);
    expect(result.skippedReasons[0].path).toBe(bad);
  });

  it("records a skip reason for a non-existent path", async () => {
    const result = await scanPaths([path.join(tmpDir, "does-not-exist")]);
    expect(result.files).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedReasons[0].reason).toContain("无法访问");
  });
});
