import type { ModelMessage, ToolSet } from "ai";
import { renderChatPrompt } from "../context/chat-render";
import type { Command, CommandResult } from "./types";

interface RenderData {
  model: string;
  instructions: string;
  tools: ToolSet;
  messages: ModelMessage[];
}

export const createRenderCommand = (getData: () => RenderData): Command => ({
  name: "render",
  description: "Render conversation as raw prompt text",
  execute: async (): Promise<CommandResult> => {
    const data = getData();

    if (data.messages.length === 0) {
      return { success: false, message: "No messages to render." };
    }

    try {
      const text = await renderChatPrompt(data);
      return { success: true, message: text || "(empty render result)" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, message: `Render failed: ${errorMessage}` };
    }
  },
});
