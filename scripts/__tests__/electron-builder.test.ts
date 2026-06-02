import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

describe("electron-builder.yml (P2-T18 packaging)", () => {
  const cfgPath = path.join(process.cwd(), "electron-builder.yml");
  const cfg = yaml.load(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>;

  it("is valid YAML with the expected top-level keys", () => {
    expect(cfg.appId).toBeTruthy();
    expect(cfg.productName).toBeTruthy();
    expect(cfg.nsis).toBeTruthy();
  });

  it("preserves user data on uninstall (deleteAppDataOnUninstall: false)", () => {
    const nsis = cfg.nsis as Record<string, unknown>;
    expect(nsis.deleteAppDataOnUninstall).toBe(false);
  });

  it("references the EULA so the NSIS installer shows it before install", () => {
    const nsis = cfg.nsis as Record<string, unknown>;
    expect(nsis.license).toBe("build/EULA.txt");
    expect(fs.existsSync(path.join(process.cwd(), "build", "EULA.txt"))).toBe(true);
  });

  it("targets NSIS for Windows with x64 arch", () => {
    const win = cfg.win as { target: Array<{ target: string; arch: string[] }> };
    expect(win.target[0].target).toBe("nsis");
    expect(win.target[0].arch).toContain("x64");
  });

  it("bundles the Prisma template DB and PaddleOCR runner in extraResources", () => {
    const extra = cfg.extraResources as Array<{ from: string }>;
    const froms = extra.map((e) => e.from);
    expect(froms).toContain("prisma/bid_doc_manager.db");
    expect(froms).toContain("vendor/paddleocr");
  });
});
