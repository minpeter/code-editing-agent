import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { truncateToolOutput } from "./tool-output-truncation";

const createdFiles: string[] = [];

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
});

describe("truncateToolOutput", () => {
  it("returns original output for read_file within limits", async () => {
    const text = [
      "OK - read file",
      "path: demo.ts",
      "",
      "======== demo.ts L1-L2 ========",
      "1#AA|a",
      "2#BB|b",
      "======== end ========",
    ].join("\n");

    const result = await truncateToolOutput("read_file", text);

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
  });

  it("offloads oversized read_file output to temp file", async () => {
    const body = Array.from(
      { length: 1200 },
      (_, i) => `${i + 1}#AA|line-${i + 1}`
    ).join("\n");
    const text = [
      "OK - read file",
      "path: big.ts",
      "",
      "======== big.ts L1-L1200 ========",
      body,
      "======== end ========",
    ].join("\n");

    const result = await truncateToolOutput("read_file", text);
    if (result.fullOutputPath) {
      createdFiles.push(result.fullOutputPath);
    }

    expect(result.truncated).toBe(true);
    expect(result.fullOutputPath).toBeDefined();
    expect(result.text).toContain("truncated for context safety");
    expect(result.text).toContain("Use read_file again on the original path");
    expect(result.text).toContain("big.ts");
    expect(result.text).not.toContain("line-1200");
    const savedPath = result.fullOutputPath;
    expect(savedPath).toBeDefined();
    if (!savedPath) {
      throw new Error("Expected full output path to exist");
    }
    expect(readFileSync(savedPath, "utf8")).toContain("line-1200");
  });

  it("offloads oversized grep output with tool-specific threshold", async () => {
    const body = Array.from(
      { length: 900 },
      (_, i) => `file.ts:${i + 1}#AA|match-${i + 1}`
    ).join("\n");
    const text = [
      "OK - grep",
      'pattern: "needle"',
      "",
      "======== grep results ========",
      body,
      "======== end ========",
    ].join("\n");

    const result = await truncateToolOutput("grep_files", text);
    if (result.fullOutputPath) {
      createdFiles.push(result.fullOutputPath);
    }

    expect(result.truncated).toBe(true);
    expect(result.fullOutputPath).toBeDefined();
    expect(result.text).toContain("truncated for context safety");
    expect(result.text).toContain("Use grep_files again with a narrower path");
    expect(result.text).not.toContain("match-1");
  });
});
