import type {
  CheckpointHistory,
  Command,
  CommandResult,
} from "@ai-sdk-tool/harness";

interface CompactCommandOptions {
  messageHistory: CheckpointHistory;
}

const compactAction = (): CommandResult => ({
  success: true,
  message: "Compaction triggered.",
});

export const createCompactCommand = (
  options: CompactCommandOptions
): Command => ({
  name: "compact",
  description: "Manually compact conversation history",
  aliases: ["summarize"],
  execute: async (): Promise<CommandResult> => {
    await options.messageHistory.compact();
    return compactAction();
  },
});
