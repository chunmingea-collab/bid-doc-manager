import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("build/EULA.txt", () => {
  const eulaPath = path.join(process.cwd(), "build", "EULA.txt");

  it("exists and is non-empty", () => {
    expect(fs.existsSync(eulaPath)).toBe(true);
    const content = fs.readFileSync(eulaPath, "utf-8");
    expect(content.length).toBeGreaterThan(500);
  });

  it("declares the software name and license type", () => {
    const content = fs.readFileSync(eulaPath, "utf-8");
    expect(content).toContain("投标资料管理工具");
    expect(content).toMatch(/最终用户许可协议|EULA/);
  });

  it("includes the offline / local data disclaimer (core value prop)", () => {
    const content = fs.readFileSync(eulaPath, "utf-8");
    expect(content).toMatch(/离线|不上传|本机/);
  });

  it("is referenced by electron-builder.yml", () => {
    const cfg = fs.readFileSync(path.join(process.cwd(), "electron-builder.yml"), "utf-8");
    expect(cfg).toMatch(/license:\s*build\/EULA\.txt/);
  });
});
