import {
  type AgentStreamResult,
  createAgent,
  MessageHistory,
  type ModelMessage,
  SessionManager,
} from "@ai-sdk-tool/harness";
import { emitEvent, runHeadless } from "@ai-sdk-tool/headless";
import { createAgentTUI } from "@ai-sdk-tool/tui";
import {
  createFriendli,
  type FriendliAIProvider,
} from "@friendliai/ai-provider";
import { createEnv } from "@t3-oss/env-core";
import { defineCommand, runMain } from "citty";
import { z } from "zod";

const DEFAULT_MODEL_ID = "zai-org/GLM-5";
const DEFAULT_SYSTEM_PROMPT =
  "You are a minimal FriendliAI example agent. Be concise and helpful.";

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

const main = defineCommand({
  meta: {
    name: "minimal-agent",
    description: "Minimal FriendliAI-backed agent example",
  },
  args: {
    headless: {
      type: "boolean",
      description: "Run in headless JSONL mode",
    },
    model: {
      type: "string",
      description: "Override the Friendli model ID",
    },
    prompt: {
      type: "string",
      description: "User prompt (required for --headless)",
    },
  },
  async run({ args }) {
    const messageHistory = new MessageHistory();
    const sessionManager = new SessionManager("minimal-agent");
    const sessionId = sessionManager.initialize();
    const selectedModelId = resolveModelId(args.model);
    const friendli = createFriendliProvider();
    const agent = createAgent({
      model: friendli(selectedModelId),
      instructions: DEFAULT_SYSTEM_PROMPT,
    });
    const runtimeAgent = {
      stream: (messages: unknown[]): Promise<AgentStreamResult> =>
        Promise.resolve(agent.stream({ messages: messages as ModelMessage[] })),
    };

    if (args.headless) {
      const prompt = args.prompt?.trim();
      if (!prompt) {
        console.error("--headless requires --prompt <text>");
        process.exitCode = 1;
        return;
      }

      emitEvent({
        timestamp: new Date().toISOString(),
        type: "user",
        sessionId,
        content: prompt,
      });
      messageHistory.addUserMessage(prompt);

      await runHeadless({
        sessionId,
        emitEvent,
        getModelId: () => selectedModelId,
        messageHistory,
        maxIterations: 1,
        stream: runtimeAgent.stream,
      });
      return;
    }

    await createAgentTUI({
      agent: runtimeAgent,
      messageHistory,
      header: {
        title: "Minimal Agent",
        subtitle: `${selectedModelId} • ${sessionId}`,
      },
    });

    process.exit(0);
  },
});

runMain(main);
