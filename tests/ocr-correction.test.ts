import { describe, it, expect } from "vitest";
import { extractKeyInfo } from "../src/main/services/classifier/key-info-extractor";

describe("extractKeyInfo (P2-T16 contract)", () => {
  it("extracts a company name and certificate number from a typical line", () => {
    const text = "投标人：建工集团股份有限公司\n证书编号：ISO-9001-2024-XYZ\n有效期至：2027-06-30\n";
    const info = extractKeyInfo(text);
    expect(info.companyName).toContain("建工集团");
    expect(info.certificateNumber).toBe("ISO-9001-2024-XYZ");
    expect(info.expiryDate).toBe("2027-06-30");
  });

  it("returns null for text with no recognizable fields", () => {
    const info = extractKeyInfo("hello world");
    expect(info.certificateNumber).toBeNull();
    expect(info.companyName).toBeNull();
    expect(info.expiryDate).toBeNull();
    expect(info.personName).toBeNull();
    expect(info.qualificationLevel).toBeNull();
  });

  it("does not throw on very short or weird text", () => {
    expect(() => extractKeyInfo("")).not.toThrow();
    expect(() => extractKeyInfo("123456")).not.toThrow();
    expect(() => extractKeyInfo("公司\n编号\n日期")).not.toThrow();
  });

  it("trims and de-dupes leading '证书编号'/'编号' prefixes", () => {
    const info = extractKeyInfo("证书编号：AB-12345");
    expect(info.certificateNumber).toBe("AB-12345");
  });

  it("identifies a qualification level from common Chinese strings", () => {
    const info = extractKeyInfo("本证书为一级注册建造师执业资格证书");
    // Sorted by length desc — "注册建造师" (5 chars) wins over
    // "一级注册" (4) and "一级" (2) by being checked first.
    expect(info.qualificationLevel).toBe("注册建造师");
  });
});
