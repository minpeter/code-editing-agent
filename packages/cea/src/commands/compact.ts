import type {
  Command,
  CommandResult,
  CompactionOrchestrator,
} from "@ai-sdk-tool/harness";

export const createCompactCommand = (
  getOrchestrator: () => CompactionOrchestrator
): Command => ({
  name: "compact",
  description: "Force conversation compaction",
  aliases: ["summarize"],
  execute: async (): Promise<CommandResult> => {
    const orchestrator = getOrchestrator();

    const result = await orchestrator.manualCompact();

    if (!result.success) {
      return {
        success: false,
        message: result.reason || "Compaction failed",
      };
    }

    const reduction =
      result.tokensBefore > 0
        ? Math.max(
            0,
            Math.round((1 - result.tokensAfter / result.tokensBefore) * 100)
          )
        : 0;

    return {
      success: true,
      message: `Compacted: ${result.tokensBefore.toLocaleString()} → ${result.tokensAfter.toLocaleString()} tokens (${reduction}% reduction)`,
    };
  },
});
