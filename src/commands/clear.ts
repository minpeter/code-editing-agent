import type { MessageHistory } from "../context/message-history";
import type { Command, CommandResult } from "./types";

export const createClearCommand = (
  messageHistory: MessageHistory
): Command => ({
  name: "clear",
  description: "Clear current conversation history and terminal screen",
  execute: (): CommandResult => {
    messageHistory.clear();
    // Clear terminal screen (equivalent to Ctrl+L)
    process.stdout.write("\x1b[2J\x1b[H");
    return {
      success: true,
      message: "Conversation history and terminal cleared.",
    };
  },
});
