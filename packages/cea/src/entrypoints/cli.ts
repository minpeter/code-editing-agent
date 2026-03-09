#!/usr/bin/env bun

import {
  type Command,
  type CommandContext,
  MessageHistory,
  SessionManager,
  shouldContinueManualToolLoop,
} from "@ai-sdk-tool/harness";
import { createAgentTUI } from "@ai-sdk-tool/tui";
import type { EditorTheme, MarkdownTheme } from "@mariozechner/pi-tui";
import type { FinishReason, ModelMessage } from "ai";
import type { ProviderType } from "../agent";
import { agentManager } from "../agent";
import {
  parseProviderArg,
  parseReasoningCliOption,
  parseToolFallbackCliOption,
  parseTranslateCliOption,
} from "../cli-args";
import { getCommands, registerCommand } from "../commands";
import { createClearCommand } from "../commands/clear";
import { createModelCommand } from "../commands/model";
import { createReasoningModeCommand } from "../commands/reasoning-mode";
import { createRenderCommand } from "../commands/render";
import { createToolFallbackCommand } from "../commands/tool-fallback";
import { createTranslateCommand } from "../commands/translate";
import type { SkillInfo } from "../context/skills";
import { loadAllSkills } from "../context/skills";
import { isNonEnglish, translateToEnglish } from "../context/translation";
import { validateProviderConfig } from "../env";
import { setSpinnerOutputEnabled } from "../interaction/spinner";
import {
  buildTodoContinuationUserMessage,
  getIncompleteTodos,
} from "../middleware/todo-continuation";
import type { ReasoningMode } from "../reasoning-mode";
import {
  DEFAULT_TOOL_FALLBACK_MODE,
  type ToolFallbackMode,
} from "../tool-fallback-mode";
import { resetMissingLinesFailures } from "../tools/modify/edit-file-diagnostics";
import { cleanup } from "../tools/utils/execute/process-manager";
import { initializeTools } from "../utils/tools-manager";

const ANSI_RESET = "\x1b[0m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_DIM = "\x1b[2m";
const ANSI_ITALIC = "\x1b[3m";
const ANSI_UNDERLINE = "\x1b[4m";
const ANSI_GREEN = "\x1b[92m";
const ANSI_YELLOW = "\x1b[93m";
const ANSI_MAGENTA = "\x1b[95m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_BRIGHT_CYAN = "\x1b[96m";
const ANSI_GRAY = "\x1b[90m";

const style = (prefix: string, text: string): string => {
  return `${prefix}${text}${ANSI_RESET}`;
};

const createMarkdownTheme = (): MarkdownTheme => {
  return {
    heading: (text) => style(`${ANSI_BOLD}${ANSI_BRIGHT_CYAN}`, text),
    link: (text) => style(`${ANSI_UNDERLINE}${ANSI_CYAN}`, text),
    linkUrl: (text) => style(ANSI_GRAY, text),
    code: (text) => style(ANSI_YELLOW, text),
    codeBlock: (text) => style(ANSI_GREEN, text),
    codeBlockBorder: (text) => style(ANSI_GRAY, text),
    quote: (text) => style(`${ANSI_ITALIC}${ANSI_GRAY}`, text),
    quoteBorder: (text) => style(ANSI_GRAY, text),
    hr: (text) => style(ANSI_GRAY, text),
    listBullet: (text) => style(ANSI_MAGENTA, text),
    bold: (text) => style(ANSI_BOLD, text),
    italic: (text) => style(ANSI_ITALIC, text),
    strikethrough: (text) => style(ANSI_DIM, text),
    underline: (text) => style(ANSI_UNDERLINE, text),
    codeBlockIndent: "  ",
  };
};

const createEditorTheme = (): EditorTheme => {
  return {
    borderColor: (text: string) => style(ANSI_GRAY, text),
    selectList: {
      selectedPrefix: (text: string) => style(`${ANSI_BOLD}${ANSI_CYAN}`, text),
      selectedText: (text: string) => style(ANSI_CYAN, text),
      description: (text: string) => style(ANSI_GRAY, text),
      scrollInfo: (text: string) => style(ANSI_DIM, text),
      noMatch: (text: string) => style(ANSI_DIM, text),
    },
  };
};

const messageHistory = new MessageHistory();
const sessionManagerScope = globalThis as typeof globalThis & {
  __ceaSessionManager?: SessionManager;
};
if (!sessionManagerScope.__ceaSessionManager) {
  sessionManagerScope.__ceaSessionManager = new SessionManager();
}
const sessionManager = sessionManagerScope.__ceaSessionManager;

let requestedProcessExitCode: number | null = null;
let signalShutdownRequested = false;

registerCommand(
  createRenderCommand(async () => ({
    model: agentManager.getModelId(),
    modelType: agentManager.getModelType(),
    instructions: await agentManager.getInstructions(),
    tools: agentManager.getTools(),
    messages: messageHistory.toModelMessages(),
    reasoningMode: agentManager.getReasoningMode(),
    toolFallbackMode: agentManager.getToolFallbackMode(),
  }))
);
registerCommand(createModelCommand());
registerCommand(createClearCommand());
registerCommand(createReasoningModeCommand());
registerCommand(createToolFallbackCommand());
registerCommand(createTranslateCommand());

const parseCliArgs = (): {
  model: string | null;
  provider: ProviderType | null;
  reasoningMode: ReasoningMode | null;
  toolFallbackMode: ToolFallbackMode;
  translateUserPrompts: boolean;
} => {
  const args = process.argv.slice(2);
  let reasoningMode: ReasoningMode | null = null;
  let toolFallbackMode: ToolFallbackMode = DEFAULT_TOOL_FALLBACK_MODE;
  let model: string | null = null;
  let provider: ProviderType | null = null;
  let translateUserPrompts = true;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    const reasoningOption = parseReasoningCliOption(args, i);
    if (reasoningOption) {
      reasoningMode = reasoningOption.mode;
      i += reasoningOption.consumedArgs;
      continue;
    }

    const toolFallbackOption = parseToolFallbackCliOption(args, i);
    if (toolFallbackOption) {
      toolFallbackMode = toolFallbackOption.mode;
      i += toolFallbackOption.consumedArgs;
      continue;
    }

    if (arg === "--model" && i + 1 < args.length) {
      model = args[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--provider" && i + 1 < args.length) {
      provider = parseProviderArg(args[i + 1]) ?? provider;
      i += 1;
      continue;
    }

    const translateOption = parseTranslateCliOption(arg);
    if (translateOption !== null) {
      translateUserPrompts = translateOption;
    }
  }

  return {
    reasoningMode,
    toolFallbackMode,
    model,
    provider,
    translateUserPrompts,
  };
};

const setupAgent = (): void => {
  const {
    reasoningMode,
    toolFallbackMode,
    model,
    provider,
    translateUserPrompts,
  } = parseCliArgs();

  if (provider) {
    agentManager.setProvider(provider);
  }
  if (model) {
    agentManager.setModelId(model);
  }
  if (reasoningMode !== null) {
    agentManager.setReasoningMode(reasoningMode);
  }

  agentManager.setToolFallbackMode(toolFallbackMode);
  agentManager.setTranslationEnabled(translateUserPrompts);
  messageHistory.updateCompaction(agentManager.buildCompactionConfig());
};

const toModelMessages = (messages: unknown[]): ModelMessage[] => {
  return messages as ModelMessage[];
};

const withTranslatedLastUserMessage = async (
  messages: ModelMessage[]
): Promise<ModelMessage[]> => {
  if (!agentManager.isTranslationEnabled() || messages.length === 0) {
    return messages;
  }

  const lastIndex = messages.length - 1;
  const lastMessage = messages[lastIndex];
  if (
    lastMessage.role !== "user" ||
    typeof lastMessage.content !== "string" ||
    !isNonEnglish(lastMessage.content)
  ) {
    return messages;
  }

  const translation = await translateToEnglish(
    lastMessage.content,
    agentManager
  );
  if (translation.error || translation.text === lastMessage.content) {
    return messages;
  }

  const translatedMessages = [...messages];
  translatedMessages[lastIndex] = {
    ...lastMessage,
    content: translation.text,
  };
  return translatedMessages;
};

const buildAgentStreamWithTodoContinuation = () => {
  return {
    stream: async (messages: unknown[], opts?: unknown) => {
      const preparedMessages = await withTranslatedLastUserMessage(
        toModelMessages(messages)
      );
      const stream = await agentManager.stream(preparedMessages, opts as never);

      const continuationDecision = (async (): Promise<{
        finishReason: FinishReason;
        reminder: string | null;
      }> => {
        const baseFinishReason = await stream.finishReason;
        if (shouldContinueManualToolLoop(baseFinishReason)) {
          return {
            finishReason: baseFinishReason,
            reminder: null,
          };
        }

        const incompleteTodos = await getIncompleteTodos();
        if (incompleteTodos.length === 0) {
          return {
            finishReason: baseFinishReason,
            reminder: null,
          };
        }

        return {
          finishReason: "tool-calls",
          reminder: buildTodoContinuationUserMessage(incompleteTodos),
        };
      })();

      const response = (async () => {
        const baseResponse = await stream.response;
        const decision = await continuationDecision;
        if (!decision.reminder) {
          return baseResponse;
        }

        type StreamResponse = Awaited<typeof stream.response>;
        const reminderMessage = {
          role: "user",
          content: decision.reminder,
        } as unknown as StreamResponse["messages"][number];

        return {
          ...baseResponse,
          messages: [...baseResponse.messages, reminderMessage],
        } as StreamResponse;
      })();

      return {
        ...stream,
        response,
        finishReason: continuationDecision.then(
          (decision) => decision.finishReason
        ),
      };
    },
  };
};

const updateCompactionForCurrentModel = (): void => {
  messageHistory.updateCompaction(agentManager.buildCompactionConfig());
};

const wrapCommand = (
  command: Command,
  execute: (
    context: CommandContext,
    original: Command["execute"]
  ) => ReturnType<Command["execute"]>
): Command => {
  return {
    ...command,
    execute: (context) => execute(context, command.execute),
  };
};

const createCliCommands = (): Command[] => {
  const commands = Array.from(getCommands().values());

  return commands.map((command) => {
    if (command.name === "clear") {
      return wrapCommand(command, async (context, original) => {
        const result = await original(context);
        if (result.success && result.action === "new-session") {
          sessionManager.initialize();
          resetMissingLinesFailures();
        }
        return result;
      });
    }

    if (command.name === "model") {
      return wrapCommand(command, async (context, original) => {
        const result = await original(context);
        if (result.success) {
          updateCompactionForCurrentModel();
        }
        return result;
      });
    }

    if (command.name === "reasoning-mode" || command.name === "think") {
      return wrapCommand(command, async (context, original) => {
        const result = await original(context);
        if (result.success) {
          updateCompactionForCurrentModel();
        }
        return result;
      });
    }

    return command;
  });
};

const run = async (): Promise<void> => {
  validateProviderConfig();
  await initializeTools();
  const skills: SkillInfo[] = await loadAllSkills();
  setSpinnerOutputEnabled(false);

  sessionManager.initialize();
  setupAgent();

  const headerSubtitle = `${agentManager.getProvider()}/${agentManager.getModelId()}\nSession: ${sessionManager.getId()}`;

  try {
    await createAgentTUI({
      agent: buildAgentStreamWithTodoContinuation(),
      messageHistory,
      skills,
      commands: createCliCommands(),
      header: {
        title: "Code Editing Agent",
        subtitle: headerSubtitle,
      },
      theme: {
        markdownTheme: createMarkdownTheme(),
        editorTheme: createEditorTheme(),
      },
      onSetup: () => {
        setSpinnerOutputEnabled(false);
      },
    });
  } finally {
    cleanup();
    setSpinnerOutputEnabled(true);
  }

  process.exit(requestedProcessExitCode ?? 0);
};

const exitWithCleanup = (code: number): never => {
  cleanup(true);
  process.exit(code);
};

const requestSignalShutdown = (code: number): void => {
  if (signalShutdownRequested) {
    return;
  }
  signalShutdownRequested = true;
  requestedProcessExitCode = code;
  exitWithCleanup(code);
};

process.once("exit", () => {
  cleanup();
});

process.once("SIGTERM", () => {
  requestSignalShutdown(143);
});

process.once("SIGHUP", () => {
  requestSignalShutdown(129);
});

process.once("SIGQUIT", () => {
  requestSignalShutdown(131);
});

process.once("uncaughtException", (error: unknown) => {
  console.error("Fatal error:", error);
  exitWithCleanup(1);
});

process.once("unhandledRejection", (reason: unknown) => {
  console.error("Unhandled rejection:", reason);
  exitWithCleanup(1);
});

run().catch((error: unknown) => {
  console.error("Fatal error:", error);
  exitWithCleanup(1);
});
