import type { CompactionResult } from "@ai-sdk-tool/harness";
import { describe, expect, it, vi } from "vitest";
import { createCompactCommand } from "./compact";

const createMockOrchestrator = (result: CompactionResult) => ({
  manualCompact: vi.fn(async () => result),
});

const exec = (orchestrator: ReturnType<typeof createMockOrchestrator>) =>
  createCompactCommand(() => orchestrator as any).execute({ args: [] });

describe("compact command", () => {
  it("returns failure when compaction fails", async () => {
    const orchestrator = createMockOrchestrator({
      success: false,
      tokensBefore: 100,
      tokensAfter: 100,
      reason: "Compaction not available",
    });
    const result = await exec(orchestrator);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Compaction not available");
  });

  it("reports token reduction on successful compaction", async () => {
    const orchestrator = createMockOrchestrator({
      success: true,
      tokensBefore: 1000,
      tokensAfter: 600,
    });
    const result = await exec(orchestrator);
    expect(result.success).toBe(true);
    expect(result.message).toContain("1,000");
    expect(result.message).toContain("600");
    expect(result.message).toContain("→");
    expect(result.message).toContain("40");
  });

  it("never shows negative reduction percentage", async () => {
    const orchestrator = createMockOrchestrator({
      success: true,
      tokensBefore: 100,
      tokensAfter: 120,
    });
    const result = await exec(orchestrator);
    expect(result.success).toBe(true);
    expect(result.message).not.toContain("-");
    expect(result.message).toContain("0%");
  });

  it("handles zero token compaction gracefully", async () => {
    const orchestrator = createMockOrchestrator({
      success: true,
      tokensBefore: 0,
      tokensAfter: 0,
    });
    const result = await exec(orchestrator);
    expect(result.success).toBe(true);
    expect(result.message).toContain("0");
  });

  it("handles large token counts with locale formatting", async () => {
    const orchestrator = createMockOrchestrator({
      success: true,
      tokensBefore: 50_000,
      tokensAfter: 25_000,
    });
    const result = await exec(orchestrator);
    expect(result.success).toBe(true);
    expect(result.message).toContain("50,000");
    expect(result.message).toContain("25,000");
  });

  it("reports specific failure reason when compaction rejected", async () => {
    const orchestrator = createMockOrchestrator({
      success: false,
      tokensBefore: 500,
      tokensAfter: 500,
      reason: "compaction in progress",
    });
    const result = await exec(orchestrator);
    expect(result.success).toBe(false);
    expect(result.message).toContain("compaction in progress");
  });

  it("uses 'Compaction failed' as default failure message", async () => {
    const orchestrator = createMockOrchestrator({
      success: false,
      tokensBefore: 0,
      tokensAfter: 0,
    });
    const result = await exec(orchestrator);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Compaction failed");
  });
});
