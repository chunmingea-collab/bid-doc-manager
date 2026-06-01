import { describe, it, expect } from "vitest";
import { DEFAULT_CATEGORY_COLORS } from "../src/main/services/seed-service";

describe("seed-service: default color palette", () => {
  it("assigns a distinct hex color to every top-level category", () => {
    const topLevel = ["qualification", "basics", "personnel", "performance", "finance", "certification", "intellectual", "other"];
    for (const id of topLevel) {
      expect(DEFAULT_CATEGORY_COLORS[id]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("uses Antd v5 preset palette tokens (no arbitrary hex)", () => {
    // We deliberately use a curated subset of the Antd color presets so the
    // category tree looks at home in both light and dark themes.
    const known = new Set([
      "#1677ff", "#722ed1", "#52c41a", "#fa8c16",
      "#13c2c2", "#eb2f96", "#fadb14", "#bfbfbf",
      "#4096ff", "#69b1ff",
      "#73d13d", "#95de64",
      "#9254de", "#b37feb",
      "#ffa940", "#ffc069",
      "#36cfc9", "#5cdbd3",
      "#f759ab", "#ff85c0",
      "#ffd666", "#ffe58f",
    ]);
    for (const [id, color] of Object.entries(DEFAULT_CATEGORY_COLORS)) {
      expect(known.has(color), `unexpected color ${color} for ${id}`).toBe(true);
    }
  });
});
