import {
  CheckpointHistory,
  type Command,
  type ContextUsage,
  createAgent,
  createModelSummarizer,
  estimateTokens,
  SessionManager,
} from "@ai-sdk-tool/harness";
import { emitEvent, runHeadless } from "@ai-sdk-tool/headless";
import { createAgentTUI } from "@ai-sdk-tool/tui";
import {
  createFriendli,
  type FriendliAIProvider,
} from "@friendliai/ai-provider";
import { createEnv } from "@t3-oss/env-core";
import type { LanguageModel } from "ai";
import { defineCommand, runMain } from "citty";
import { z } from "zod";

const DEFAULT_MODEL_ID = "zai-org/GLM-5";
const DEFAULT_SYSTEM_PROMPT =
  "You are a minimal example agent. Be concise and helpful.";

// --- Compaction tuning for 15-turn chatbot within 2000 tokens ---
// Context budget: 2000 tokens total
// Reserve 400 tokens for model output (chatbot responses are short)
// Keep 350 tokens of recent messages (~3-4 turns) during compaction
// Trigger blocking compaction at 50% of context (1000 tokens, ~turn 11)
// Start speculative compaction at 75% of blocking threshold (750 tokens, ~turn 8)
const COMPACTION_CONTEXT_TOKENS = 2000;
const COMPACTION_RESERVE_TOKENS = 400;
const COMPACTION_KEEP_RECENT_TOKENS = 350;
const COMPACTION_THRESHOLD_RATIO = 0.5;
const COMPACTION_SPECULATIVE_RATIO = 0.75;
const LOCAL_COMMANDS: Command[] = [
  {
    name: "new",
    aliases: ["clear", "reset"],
    description: "Clear the conversation and start a new session",
    execute: () => ({
      success: true,
      action: { type: "new-session" },
      message: "Started a new session.",
    }),
  },
];

const env = createEnv({
  server: {
    FRIENDLI_BASE_URL: z.string().min(1).optional(),
    FRIENDLI_MODEL: z.string().min(1).optional(),
    FRIENDLI_TOKEN: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

function createFriendliProvider(): FriendliAIProvider {
  return createFriendli({
    apiKey: env.FRIENDLI_TOKEN,
    baseURL: env.FRIENDLI_BASE_URL || "serverless",
    includeUsage: true,
  });
}

function resolveModelId(cliModel?: string): string {
  return cliModel?.trim() || env.FRIENDLI_MODEL || DEFAULT_MODEL_ID;
}

function createCompactionConfig(model: LanguageModel) {
  return {
    enabled: true,
    contextLimit: COMPACTION_CONTEXT_TOKENS,
    keepRecentTokens: COMPACTION_KEEP_RECENT_TOKENS,
    reserveTokens: COMPACTION_RESERVE_TOKENS,
    thresholdRatio: COMPACTION_THRESHOLD_RATIO,
    speculativeStartRatio: COMPACTION_SPECULATIVE_RATIO,
    summarizeFn: createModelSummarizer(model, {
      contextLimit: COMPACTION_CONTEXT_TOKENS,
    }),
  } as const;
}

function formatTokens(tokenCount: number): string {
  if (tokenCount >= 1000) {
    return `${(tokenCount / 1000).toFixed(1)}k`;
  }

  return String(tokenCount);
}

function formatContextUsage(contextUsage: ContextUsage): string {
  if (contextUsage.limit <= 0) {
    return `?/${formatTokens(contextUsage.limit)} (?)`;
  }

  return `${formatTokens(contextUsage.used)}/${formatTokens(contextUsage.limit)} (${contextUsage.percentage}%)`;
}

const main = defineCommand({
  meta: {
    name: "minimal-agent",
    description: "Minimal FriendliAI-backed agent example",
  },
  args: {
    model: {
      alias: ["m"],
      type: "string",
      description: "Override the Friendli model ID",
    },
    prompt: {
      alias: ["p"],
      type: "string",
      description:
        "User prompt. Providing this enters headless mode automatically.",
    },
  },
  async run({ args }) {
    const sessionManager = new SessionManager("minimal-agent");
    sessionManager.initialize();
    const selectedModelId = resolveModelId(args.model);
    const friendli = createFriendliProvider();
    const model = friendli(selectedModelId);
    const compaction = createCompactionConfig(model);
    const messageHistory = new CheckpointHistory({
      compaction,
    });
    messageHistory.setContextLimit(COMPACTION_CONTEXT_TOKENS);
    messageHistory.setSystemPromptTokens(estimateTokens(DEFAULT_SYSTEM_PROMPT));

    const agent = createAgent({
      model,
      instructions: DEFAULT_SYSTEM_PROMPT,
    });

    const prompt = args.prompt?.trim();
    if (prompt) {
      await runHeadless({
        agent,
        sessionId: sessionManager.getId(),
        emitEvent,
        initialUserMessage: {
          content: prompt,
        },
        messageHistory,
        maxIterations: 1,
        modelId: selectedModelId,
      });
      return;
    }

    await createAgentTUI({
      agent,
      commands: LOCAL_COMMANDS,
      footer: {
        get text() {
          const contextUsage = messageHistory.getContextUsage();
          if (!contextUsage) {
            return undefined;
          }

          return formatContextUsage(contextUsage);
        },
      },
      messageHistory,
      header: {
        title: "Minimal Agent",
        get subtitle() {
          return `${selectedModelId}\nSession: ${sessionManager.getId()}`;
        },
      },
      onCommandAction: (action) => {
        if (action.type === "new-session") {
          sessionManager.initialize();
        }
      },
    });

    process.exit(0);
  },
});

runMain(main);
