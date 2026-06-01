import { describe, expect, it } from "vitest";
import { formatError } from "../src/renderer/utils/errors";

describe("formatError", () => {
  it("returns Error.message when given an Error", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });

  it("returns Error.name when message is empty", () => {
    const e = new Error("");
    expect(formatError(e)).toBe("Error");
  });

  it("returns string verbatim when given a string", () => {
    expect(formatError("just a string")).toBe("just a string");
  });

  it("extracts message from a plain object", () => {
    expect(formatError({ message: "x" })).toBe("x");
  });

  it("falls back to '未知错误' for null / undefined / numbers", () => {
    expect(formatError(null)).toBe("未知错误");
    expect(formatError(undefined)).toBe("未知错误");
    expect(formatError(42)).toBe("未知错误");
  });
});
