#!/usr/bin/env bun
import { MessageHistory, SessionManager } from "@ai-sdk-tool/harness";
import {
  emitEvent,
  registerSignalHandlers,
  runHeadless,
  type TrajectoryEvent,
} from "@ai-sdk-tool/headless";
import type { ModelMessage } from "ai";
import { agentManager, type ProviderType } from "../agent";
import {
  parseProviderArg,
  parseReasoningCliOption,
  parseToolFallbackCliOption,
  parseTranslateCliOption,
} from "../cli-args";
import { translateToEnglish } from "../context/translation";
import { validateProviderConfig } from "../env";
import {
  buildTodoContinuationUserMessage,
  getIncompleteTodos,
} from "../middleware/todo-continuation";
import type { ReasoningMode } from "../reasoning-mode";
import {
  DEFAULT_TOOL_FALLBACK_MODE,
  type ToolFallbackMode,
} from "../tool-fallback-mode";
import { cleanup } from "../tools/utils/execute/process-manager";
import { initializeTools } from "../utils/tools-manager";
import { applyHeadlessAgentConfig } from "./headless-agent-config";

type EventInput = TrajectoryEvent extends infer Event
  ? Event extends { sessionId: string }
    ? Omit<Event, "sessionId"> & { sessionId?: string }
    : never
  : never;
interface ParsedArgs {
  maxIterations?: number;
  model?: string;
  prompt: string;
  provider: ProviderType | null;
  reasoningMode: ReasoningMode | null;
  toolFallbackMode: ToolFallbackMode;
  translateUserPrompts: boolean;
}

const globalSessionState = globalThis as typeof globalThis & {
  __ceaSessionManager?: SessionManager;
};
if (!globalSessionState.__ceaSessionManager) {
  globalSessionState.__ceaSessionManager = new SessionManager();
}
const sessionId = globalSessionState.__ceaSessionManager.initialize();
const startTime = Date.now();
const cleanupExecutionResources = (): void => cleanup();
const exitWithCleanup = (code: number): never => {
  cleanup(true);
  process.exit(code);
};
registerSignalHandlers({
  onCleanup: cleanupExecutionResources,
  onFatalCleanup: exitWithCleanup,
});
const emit = (event: EventInput): void =>
  emitEvent({ ...event, sessionId } as TrajectoryEvent);

const parsePromptOrModelOption = (
  args: string[],
  index: number
): { consumedArgs: number; kind: "prompt" | "model"; value: string } | null => {
  const arg = args[index],
    value = args[index + 1] || "";
  if (arg === "-p" || arg === "--prompt") {
    return { consumedArgs: 1, kind: "prompt", value };
  }
  if (arg === "-m" || arg === "--model") {
    return { consumedArgs: 1, kind: "model", value };
  }
  return null;
};

const parseMaxIterations = (
  args: string[],
  index: number
): { consumedArgs: number; value: number } | null => {
  if (args[index] !== "--max-iterations" || index + 1 >= args.length) {
    return null;
  }
  const value = Number.parseInt(args[index + 1], 10);
  return Number.isNaN(value) || value <= 0 ? null : { value, consumedArgs: 1 };
};

const parseProviderOption = (
  args: string[],
  index: number
): { consumedArgs: number; provider: ProviderType | null } | null =>
  args[index] !== "--provider" || index + 1 >= args.length
    ? null
    : { provider: parseProviderArg(args[index + 1]), consumedArgs: 1 };

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  let prompt = "";
  let model: string | undefined;
  let provider: ProviderType | null = null;
  let reasoningMode: ReasoningMode | null = null;
  let toolFallbackMode: ToolFallbackMode = DEFAULT_TOOL_FALLBACK_MODE;
  let translateUserPrompts = true;
  let maxIterations: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const promptOrModel = parsePromptOrModelOption(args, index);
    if (promptOrModel) {
      if (promptOrModel.kind === "prompt") {
        prompt = promptOrModel.value;
      } else {
        model = promptOrModel.value || undefined;
      }
      index += promptOrModel.consumedArgs;
      continue;
    }
    const reasoningOption = parseReasoningCliOption(args, index);
    if (reasoningOption) {
      reasoningMode = reasoningOption.mode;
      index += reasoningOption.consumedArgs;
      continue;
    }
    const providerOption = parseProviderOption(args, index);
    if (providerOption) {
      if (providerOption.provider) {
        provider = providerOption.provider;
      }
      index += providerOption.consumedArgs;
      continue;
    }
    const translateOption = parseTranslateCliOption(args[index]);
    if (translateOption !== null) {
      translateUserPrompts = translateOption;
      continue;
    }
    const toolFallbackOption = parseToolFallbackCliOption(args, index);
    if (toolFallbackOption) {
      toolFallbackMode = toolFallbackOption.mode;
      index += toolFallbackOption.consumedArgs;
    }
    const maxIterOption = parseMaxIterations(args, index);
    if (maxIterOption) {
      maxIterations = maxIterOption.value;
      index += maxIterOption.consumedArgs;
    }
  }

  if (!prompt) {
    console.error(
      "Usage: bun run src/entrypoints/headless.ts -p <prompt> [-m <model>] [--provider anthropic|friendli] [--translate|--no-translate] [--think] [--reasoning-mode <off|on|interleaved|preserved>] [--tool-fallback [mode]] [--toolcall-mode <mode>] [--max-iterations <n>]"
    );
    process.exit(1);
  }

  return {
    prompt,
    model,
    provider,
    reasoningMode,
    toolFallbackMode,
    translateUserPrompts,
    maxIterations,
  };
};

const run = async (): Promise<void> => {
  validateProviderConfig();
  await initializeTools();
  const {
    prompt,
    model,
    provider,
    reasoningMode,
    toolFallbackMode,
    translateUserPrompts,
    maxIterations,
  } = parseArgs();
  applyHeadlessAgentConfig(agentManager, {
    model,
    provider,
    reasoningMode,
    toolFallbackMode,
    translateUserPrompts,
  });

  const messageHistory = new MessageHistory({
    compaction: agentManager.buildCompactionConfig(),
  });
  const preparedPrompt = agentManager.isTranslationEnabled()
    ? await translateToEnglish(prompt, agentManager)
    : { translated: false, text: prompt };
  emit({ timestamp: new Date().toISOString(), type: "user", content: prompt });
  if (preparedPrompt.error) {
    emit({
      timestamp: new Date().toISOString(),
      type: "error",
      error: `[translation] Failed to translate input: ${preparedPrompt.error}. Using original text.`,
    });
  }
  messageHistory.addUserMessage(
    preparedPrompt.text,
    preparedPrompt.originalText
  );

  try {
    await runHeadless({
      sessionId,
      getModelId: () => agentManager.getModelId(),
      stream: (messages) => agentManager.stream(messages as ModelMessage[]),
      messageHistory,
      maxIterations,
      emitEvent: (event) => emit(event),
      onTodoReminder: async () => {
        const incompleteTodos = await getIncompleteTodos();
        return incompleteTodos.length === 0
          ? { hasReminder: false, message: null }
          : {
              hasReminder: true,
              message: buildTodoContinuationUserMessage(incompleteTodos),
            };
      },
    });
  } catch (error) {
    emit({
      timestamp: new Date().toISOString(),
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    exitWithCleanup(1);
  }

  cleanupExecutionResources();
  console.error(
    `[headless] Completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`
  );
};

run().catch((error: unknown) => {
  console.error("Fatal error:", error);
  exitWithCleanup(1);
});
