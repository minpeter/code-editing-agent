import type { Interface as ReadlineInterface } from "node:readline";
import type {
  LanguageModel,
  ModelMessage,
  ToolModelMessage,
  ToolResultPart,
} from "ai";
import type { Agent } from "../agent";
import { env } from "../env";
import { SYSTEM_PROMPT } from "../prompts/system";
import { colorize } from "../utils/colors";
import {
  deleteConversation,
  listConversations,
  loadConversation,
  saveConversation,
} from "../utils/conversation-store";
import { selectModel } from "../utils/model-selector";

interface RenderAPIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

function extractTextContent(
  parts: Array<{ type: string; text?: string }>
): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

function determineAssistantContent(
  textParts: Array<{ type: string; text?: string }>,
  hasToolCalls: boolean
): string | null {
  if (textParts.length > 0) {
    return extractTextContent(textParts);
  }
  if (hasToolCalls) {
    return null;
  }
  return "";
}

function convertUserMessage(msg: ModelMessage): RenderAPIMessage {
  const content = Array.isArray(msg.content)
    ? extractTextContent(msg.content)
    : msg.content;
  return { role: "user", content };
}

function convertAssistantMessage(msg: ModelMessage): RenderAPIMessage {
  const contentArray = Array.isArray(msg.content) ? msg.content : [];
  const textParts = contentArray.filter((p) => p.type === "text");
  const toolCallParts = contentArray.filter((p) => p.type === "tool-call");

  const content = determineAssistantContent(
    textParts,
    toolCallParts.length > 0
  );
  const assistantMsg: RenderAPIMessage = { role: "assistant", content };

  if (toolCallParts.length > 0) {
    assistantMsg.tool_calls = toolCallParts.map((tc) => ({
      id: tc.toolCallId,
      type: "function" as const,
      function: {
        name: tc.toolName,
        arguments: JSON.stringify(tc.input),
      },
    }));
  }

  return assistantMsg;
}

function convertToolMessages(msg: ToolModelMessage): RenderAPIMessage[] {
  const results: RenderAPIMessage[] = [];
  for (const part of msg.content) {
    if (part.type === "tool-result") {
      const resultPart = part as ToolResultPart;
      const content =
        typeof resultPart.output === "string"
          ? resultPart.output
          : JSON.stringify(resultPart.output);
      results.push({
        role: "tool",
        content,
        tool_call_id: resultPart.toolCallId,
      });
    }
  }
  return results;
}

function convertToRenderAPIMessages(
  messages: ModelMessage[],
  systemPrompt: string
): RenderAPIMessage[] {
  const result: RenderAPIMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push(convertUserMessage(msg));
    } else if (msg.role === "assistant") {
      result.push(convertAssistantMessage(msg));
    } else if (msg.role === "tool") {
      result.push(...convertToolMessages(msg as ToolModelMessage));
    }
  }

  return result;
}

export interface CommandContext {
  agent: Agent;
  currentConversationId: string | undefined;
  currentModelId: string;
  readline: ReadlineInterface;
  setModel: (model: LanguageModel, modelId: string) => void;
  exit: () => void;
}

export interface CommandResult {
  conversationId: string | undefined;
}

type CommandHandler = (
  args: string[],
  ctx: CommandContext
) => CommandResult | Promise<CommandResult>;

function printHelp(): void {
  console.log(`
${colorize("cyan", "Available commands:")}
  /help              - Show this help message
  /clear             - Clear current conversation
  /save              - Save current conversation
  /load <id>         - Load a saved conversation
  /list              - List all saved conversations
  /delete <id>       - Delete a saved conversation
  /models            - List and select available AI models
  /render            - Render conversation as raw prompt text
  /quit              - Exit the program
`);
}

function handleHelp(_args: string[], ctx: CommandContext): CommandResult {
  printHelp();
  return { conversationId: ctx.currentConversationId };
}

function handleClear(_args: string[], ctx: CommandContext): CommandResult {
  ctx.agent.clearConversation();
  console.log(colorize("green", "Conversation cleared."));
  return { conversationId: undefined };
}

async function handleSave(
  _args: string[],
  ctx: CommandContext
): Promise<CommandResult> {
  const messages = ctx.agent.getConversation();
  if (messages.length === 0) {
    console.log(colorize("yellow", "No conversation to save."));
    return { conversationId: ctx.currentConversationId };
  }
  const id = await saveConversation(messages, ctx.currentConversationId);
  console.log(colorize("green", `Conversation saved: ${id}`));
  return { conversationId: id };
}

async function handleLoad(
  args: string[],
  ctx: CommandContext
): Promise<CommandResult> {
  const loadId = args[0];
  if (!loadId) {
    console.log(colorize("yellow", "Usage: /load <id>"));
    return { conversationId: ctx.currentConversationId };
  }
  const stored = await loadConversation(loadId);
  if (!stored) {
    console.log(colorize("red", `Conversation not found: ${loadId}`));
    return { conversationId: ctx.currentConversationId };
  }
  ctx.agent.loadConversation(stored.messages);
  console.log(
    colorize(
      "green",
      `Loaded conversation: ${loadId} (${stored.metadata.messageCount} messages)`
    )
  );
  return { conversationId: loadId };
}

async function handleList(
  _args: string[],
  ctx: CommandContext
): Promise<CommandResult> {
  const conversations = await listConversations();
  if (conversations.length === 0) {
    console.log(colorize("yellow", "No saved conversations."));
    return { conversationId: ctx.currentConversationId };
  }
  console.log(colorize("cyan", "Saved conversations:"));
  for (const conv of conversations) {
    const date = new Date(conv.updatedAt).toLocaleString();
    const current = conv.id === ctx.currentConversationId ? " (current)" : "";
    console.log(
      `  ${conv.id} - ${conv.messageCount} messages - ${date}${current}`
    );
  }
  return { conversationId: ctx.currentConversationId };
}

async function handleDelete(
  args: string[],
  ctx: CommandContext
): Promise<CommandResult> {
  const deleteId = args[0];
  if (!deleteId) {
    console.log(colorize("yellow", "Usage: /delete <id>"));
    return { conversationId: ctx.currentConversationId };
  }
  const deleted = await deleteConversation(deleteId);
  if (deleted) {
    console.log(colorize("green", `Deleted conversation: ${deleteId}`));
    const newId =
      deleteId === ctx.currentConversationId
        ? undefined
        : ctx.currentConversationId;
    return { conversationId: newId };
  }
  console.log(colorize("red", `Failed to delete: ${deleteId}`));
  return { conversationId: ctx.currentConversationId };
}

function handleQuit(_args: string[], ctx: CommandContext): CommandResult {
  ctx.exit();
  return { conversationId: ctx.currentConversationId };
}

async function handleModels(
  _args: string[],
  ctx: CommandContext
): Promise<CommandResult> {
  const selection = await selectModel(ctx.readline, ctx.currentModelId);

  if (selection) {
    ctx.setModel(selection.model, selection.modelId);
    console.log(colorize("green", `Model changed to: ${selection.modelId}`));
  }

  return { conversationId: ctx.currentConversationId };
}

async function handleRender(
  _args: string[],
  ctx: CommandContext
): Promise<CommandResult> {
  const messages = ctx.agent.getConversation();
  if (messages.length === 0) {
    console.log(colorize("yellow", "No conversation to render."));
    return { conversationId: ctx.currentConversationId };
  }

  const apiMessages = convertToRenderAPIMessages(messages, SYSTEM_PROMPT);

  try {
    const response = await fetch(
      "https://api.friendli.ai/serverless/v1/chat/render",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.FRIENDLI_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ctx.currentModelId,
          messages: apiMessages,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.log(colorize("red", `Render failed: ${error}`));
      return { conversationId: ctx.currentConversationId };
    }

    const data = (await response.json()) as { text: string };
    console.log(colorize("cyan", "=== Rendered Prompt ==="));
    console.log(data.text);
    console.log(colorize("cyan", "======================="));
  } catch (error) {
    console.log(colorize("red", `Error: ${error}`));
  }

  return { conversationId: ctx.currentConversationId };
}

const commands: Record<string, CommandHandler> = {
  help: handleHelp,
  clear: handleClear,
  save: handleSave,
  load: handleLoad,
  list: handleList,
  delete: handleDelete,
  quit: handleQuit,
  exit: handleQuit,
  models: handleModels,
  render: handleRender,
};

export function handleCommand(
  input: string,
  ctx: CommandContext
): CommandResult | Promise<CommandResult> {
  const [command, ...args] = input.slice(1).split(" ");
  const handler = commands[command];

  if (handler) {
    return handler(args, ctx);
  }

  console.log(
    colorize(
      "yellow",
      `Unknown command: ${command}. Type /help for available commands.`
    )
  );
  return { conversationId: ctx.currentConversationId };
}
