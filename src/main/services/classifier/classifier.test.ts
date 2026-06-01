import { describe, it, expect, vi, beforeEach } from "vitest";

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("../../../utils/prisma", () => ({
  prisma: {
    category: {
      findMany: findManyMock,
    },
  },
}));

import { classifyDocument, invalidateCache } from "./classifier";
import { DEFAULT_CATEGORIES } from "../../../../config/default-categories";

function asDbRows() {
  return DEFAULT_CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    keywords: c.keywords.join(","),
    isCustom: c.isCustom,
    sortOrder: 0,
  }));
}

describe("classifyDocument", () => {
  beforeEach(() => {
    invalidateCache();
    findManyMock.mockReset();
    findManyMock.mockResolvedValue(asDbRows());
  });

  it("classifies by subcategory keyword and returns parent info", async () => {
    const result = await classifyDocument(
      "营业执照扫描件",
      "统一社会信用代码 91110000123456789X",
    );
    expect(result.categoryId).toBe("basics_license");
    expect(result.parentId).toBe("basics");
    expect(result.parentName).toBe("企业基础资料");
    expect(result.matchedKeyword).toBe("统一社会信用代码");
  });

  it("classifies ISO9001 under certification subcategory", async () => {
    const result = await classifyDocument(
      "ISO9001 质量管理体系认证",
      "质量管理体系认证证书",
    );
    expect(result.categoryId).toBe("certification_iso9001");
    expect(result.parentId).toBe("certification");
  });

  it("falls back to 其他资料 when no keyword matches", async () => {
    const result = await classifyDocument(
      "unknown_doc.pdf",
      "random text that matches nothing in any keyword set",
    );
    expect(result.categoryId).toBe("other");
    expect(result.matchedKeyword).toBe("");
  });

  it("returns empty cache and re-fetches when invalidated", async () => {
    await classifyDocument("营业执照", "统一社会信用代码");
    expect(findManyMock).toHaveBeenCalledTimes(1);

    invalidateCache();
    await classifyDocument("营业执照", "统一社会信用代码");
    expect(findManyMock).toHaveBeenCalledTimes(2);
  });
});
