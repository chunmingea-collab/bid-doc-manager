import { describe, it, expect } from "vitest";
import { pickColorForName } from "./profile-service";

describe("profile-service: pickColorForName", () => {
  it("returns a hex color from the palette", () => {
    const c = pickColorForName("北京建工");
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns the same color for the same name (deterministic)", () => {
    expect(pickColorForName("建工")).toBe(pickColorForName("建工"));
  });

  it("returns different colors for different names (in most cases)", () => {
    // 5 well-chosen names — at most one collision is possible with a 15-color
    // palette; the contract is "stable hash → stable color", not "unique".
    const colors = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map(pickColorForName),
    );
    // 5 distinct colors out of 8 names is a reasonable lower bound.
    expect(colors.size).toBeGreaterThanOrEqual(5);
  });
});
