import { describe, it, expect } from "vitest";
import { extractKeyInfo } from "./key-info-extractor";

describe("extractKeyInfo — expiryDate", () => {
  it("extracts 有效期至 prefix", () => {
    expect(extractKeyInfo("有效期至：2027-06-15").expiryDate).toBe("2027-06-15");
  });

  it("extracts 有效期限 prefix", () => {
    expect(extractKeyInfo("有效期限: 2027/6/15").expiryDate).toBe("2027-06-15");
  });

  it("extracts the END of a date RANGE 自..至", () => {
    expect(
      extractKeyInfo("自 2024-01-01 至 2027-06-15 有效").expiryDate,
    ).toBe("2027-06-15");
  });

  it("extracts the START of a 有效期至 date range", () => {
    expect(
      extractKeyInfo("2024-01-01 至 2027-06-15").expiryDate,
    ).toBe("2024-01-01");
  });

  it("returns null when no date present", () => {
    expect(extractKeyInfo("本文件长期有效").expiryDate).toBeNull();
  });
});

describe("extractKeyInfo — certificateNumber", () => {
  it("extracts 证书编号", () => {
    expect(
      extractKeyInfo("证书编号：ABC-12345-XYZ").certificateNumber,
    ).toBe("ABC-12345-XYZ");
  });

  it("extracts 统一社会信用代码", () => {
    expect(
      extractKeyInfo("统一社会信用代码：91110000123456789X").certificateNumber,
    ).toBe("91110000123456789X");
  });

  it("returns null when no certificate id present", () => {
    expect(extractKeyInfo("普通文本").certificateNumber).toBeNull();
  });
});

describe("extractKeyInfo — companyName", () => {
  it("extracts 公司名称", () => {
    expect(
      extractKeyInfo("公司名称：北京建工集团有限公司").companyName,
    ).toBe("北京建工集团有限公司");
  });

  it("extracts 投标人", () => {
    expect(
      extractKeyInfo("投标人：上海建工股份有限公司").companyName,
    ).toBe("上海建工股份有限公司");
  });
});

describe("extractKeyInfo — personName", () => {
  it("extracts 姓名", () => {
    expect(extractKeyInfo("姓名：张三").personName).toBe("张三");
  });

  it("extracts 项目负责人", () => {
    expect(extractKeyInfo("项目负责人：李四").personName).toBe("李四");
  });

  it("returns null for input without a name", () => {
    expect(extractKeyInfo("无人员信息").personName).toBeNull();
  });
});

describe("extractKeyInfo — qualificationLevel", () => {
  it("finds 特级", () => {
    expect(extractKeyInfo("建筑工程施工总承包特级资质").qualificationLevel).toBe(
      "特级",
    );
  });

  it("prefers the longest match — 高级工程师 over 工程师", () => {
    expect(extractKeyInfo("高级工程师证书").qualificationLevel).toBe("高级工程师");
  });

  it("finds 甲级 / 乙级", () => {
    expect(extractKeyInfo("工程设计甲级资质").qualificationLevel).toBe("甲级");
  });

  it("returns null for no qualification keywords", () => {
    expect(extractKeyInfo("无任何等级信息").qualificationLevel).toBeNull();
  });
});

describe("extractKeyInfo — robustness", () => {
  it("does not throw on empty or short text", () => {
    expect(() => extractKeyInfo("")).not.toThrow();
    expect(() => extractKeyInfo("123456")).not.toThrow();
    expect(() => extractKeyInfo("公司\n编号\n日期")).not.toThrow();
  });

  it("trims and de-dupes a leading 证书编号 prefix", () => {
    expect(extractKeyInfo("证书编号：AB-12345").certificateNumber).toBe("AB-12345");
  });

  it("identifies 注册建造师 (longest-match wins over 一级 / 一级注册)", () => {
    expect(
      extractKeyInfo("本证书为一级注册建造师执业资格证书").qualificationLevel,
    ).toBe("注册建造师");
  });
});
