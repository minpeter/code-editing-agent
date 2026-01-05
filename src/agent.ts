import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
} from "ai";
import { tools } from "./tools/index";
import {
  printChunk,
  printClaudePrefix,
  printNewline,
  printReasoningChunk,
  printReasoningEnd,
  printReasoningPrefix,
  printTool,
} from "./utils/colors";

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

export class Agent {
  private readonly model: LanguageModel;
  private readonly conversation: ModelMessage[] = [];
  private readonly maxSteps: number;

  constructor(model: LanguageModel, maxSteps = 10) {
    this.model = model;
    this.maxSteps = maxSteps;
  }

  async chat(userInput: string): Promise<void> {
    this.conversation.push({
      role: "user",
      content: userInput,
    });

    const result = streamText({
      model: this.model,
      messages: this.conversation,
      tools,
      stopWhen: stepCountIs(this.maxSteps),
    });

    const state: StreamState = {
      hasStartedText: false,
      hasStartedReasoning: false,
    };

    for await (const chunk of result.fullStream) {
      if (chunk.type === "reasoning-delta") {
        if (!state.hasStartedReasoning) {
          printReasoningPrefix();
          state.hasStartedReasoning = true;
        }
        printReasoningChunk(chunk.text);
      } else if (chunk.type === "text-delta") {
        endReasoningIfNeeded(state);
        if (!state.hasStartedText) {
          printClaudePrefix();
          state.hasStartedText = true;
        }
        printChunk(chunk.text);
      } else if (chunk.type === "tool-call") {
        endReasoningIfNeeded(state);
        endTextIfNeeded(state);
        printTool(chunk.toolName, chunk.input);
      }
    }

    endReasoningIfNeeded(state);
    endTextIfNeeded(state);

    const response = await result.response;
    this.conversation.push(...response.messages);
  }
}
