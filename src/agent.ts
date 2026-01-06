import type { TextStreamPart } from "ai";
import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
} from "ai";
import { env } from "./env";
import { SYSTEM_PROMPT } from "./prompts/system";
import type { tools } from "./tools/index";
import { tools as agentTools } from "./tools/index";
import {
  printAIPrefix,
  printChunk,
  printNewline,
  printReasoningChunk,
  printReasoningEnd,
  printReasoningPrefix,
  printTool,
} from "./utils/colors";
import { withRetry } from "./utils/retry";

type StreamChunk = TextStreamPart<typeof tools>;

interface StreamState {
  hasStartedText: boolean;
  hasStartedReasoning: boolean;
}

function endReasoningIfNeeded(state: StreamState): void {
  if (state.hasStartedReasoning) {
    printReasoningEnd();
    state.hasStartedReasoning = false;
  }
}

function endTextIfNeeded(state: StreamState): void {
  if (state.hasStartedText) {
    printNewline();
    state.hasStartedText = false;
  }
}

function handleReasoningDelta(chunk: StreamChunk, state: StreamState): void {
  if (chunk.type !== "reasoning-delta") {
    return;
  }
  if (!state.hasStartedReasoning) {
    printReasoningPrefix();
    state.hasStartedReasoning = true;
  }
  printReasoningChunk(chunk.text);
}

function handleTextDelta(chunk: StreamChunk, state: StreamState): void {
  if (chunk.type !== "text-delta") {
    return;
  }
  endReasoningIfNeeded(state);
  if (!state.hasStartedText) {
    printAIPrefix();
    state.hasStartedText = true;
  }
  printChunk(chunk.text);
}

function handleToolCall(chunk: StreamChunk, state: StreamState): void {
  if (chunk.type !== "tool-call") {
    return;
  }
  endReasoningIfNeeded(state);
  endTextIfNeeded(state);
  printTool(chunk.toolName, chunk.input);
}

function logDebugChunk(chunk: StreamChunk, chunkCount: number): void {
  const skipTypes = ["text-delta", "reasoning-delta", "tool-result"];
  if (!skipTypes.includes(chunk.type)) {
    console.log(`[DEBUG] #${chunkCount} type: ${chunk.type}`);
  }
}

function logDebugError(chunk: StreamChunk): void {
  if (chunk.type === "error") {
    console.log("[DEBUG] Error:", chunk.error);
  }
}

function logDebugFinish(chunk: StreamChunk): void {
  if (chunk.type === "finish") {
    console.log(`[DEBUG] Finish reason: ${chunk.finishReason}`);
  }
}

const DEFAULT_MAX_STEPS = 255;

export class Agent {
  private model: LanguageModel;
  private conversation: ModelMessage[] = [];
  private readonly maxSteps: number;

  constructor(model: LanguageModel, maxSteps = DEFAULT_MAX_STEPS) {
    this.model = model;
    this.maxSteps = maxSteps;
  }

  getModel(): LanguageModel {
    return this.model;
  }

  setModel(model: LanguageModel): void {
    this.model = model;
  }

  getConversation(): ModelMessage[] {
    return [...this.conversation];
  }

  loadConversation(messages: ModelMessage[]): void {
    this.conversation = [...messages];
  }

  clearConversation(): void {
    this.conversation = [];
  }

  async chat(userInput: string): Promise<void> {
    this.conversation.push({
      role: "user",
      content: userInput,
    });

    await withRetry(async () => {
      await this.executeStreamingChat();
    });
  }

  private async executeStreamingChat(): Promise<void> {
    const result = streamText({
      model: this.model,
      system: SYSTEM_PROMPT,
      messages: this.conversation,
      tools: agentTools,
      stopWhen: stepCountIs(this.maxSteps),
      providerOptions: {
        friendliai: {
          // enable_thinking for hybrid reasoning models
          chat_template_kwargs: {
            enable_thinking: true,
          },
        },
      },
    });

    const state: StreamState = {
      hasStartedText: false,
      hasStartedReasoning: false,
    };

    let chunkCount = 0;
    const debug = env.DEBUG_CHUNK_LOG;

    for await (const chunk of result.fullStream) {
      chunkCount++;

      if (debug) {
        logDebugChunk(chunk, chunkCount);
        logDebugError(chunk);
        logDebugFinish(chunk);
      }

      handleReasoningDelta(chunk, state);
      handleTextDelta(chunk, state);
      handleToolCall(chunk, state);
    }

    endReasoningIfNeeded(state);
    endTextIfNeeded(state);

    const response = await result.response;
    if (debug) {
      console.log(`[DEBUG] Total chunks: ${chunkCount}`);
      console.log(`[DEBUG] Response messages: ${response.messages.length}`);
    }
    this.conversation.push(...response.messages);
  }
}
