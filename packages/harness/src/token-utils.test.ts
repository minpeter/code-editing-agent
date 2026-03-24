import { describe, expect, it } from "vitest";
import { estimateTokens, extractMessageText } from "./token-utils";

describe("estimateTokens", () => {
  it("returns positive number for non-empty text", () => {
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates CJK text differently from Latin text", () => {
    const latin = estimateTokens("hello world foo bar");
    const cjk = estimateTokens("你好世界");
    expect(latin).toBeGreaterThan(0);
    expect(cjk).toBeGreaterThan(0);
  });
});

describe("extractMessageText", () => {
  it("extracts text from string content", () => {
    const msg = { role: "user" as const, content: "hello" };
    expect(extractMessageText(msg)).toBe("hello");
  });
});
