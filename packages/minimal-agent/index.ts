import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { FileSnapshotStore, formatContextUsage } from "@ai-sdk-tool/harness";
import { createAgentRuntime, defineAgent } from "@ai-sdk-tool/harness/runtime";
import { runAgentSessionHeadless } from "@ai-sdk-tool/headless/session";
import { runAgentSessionTUI } from "@ai-sdk-tool/tui/session";
import { env } from "./env";
import { createPreferences } from "./preferences";

const modelId = env.AI_MODEL;
const model = createOpenAICompatible({
  name: "custom",
  apiKey: env.AI_API_KEY,
  baseURL: env.AI_BASE_URL,
})(modelId);

const TRUTHY_TOGGLE_VALUES = new Set(["on", "enable", "true"]);
const FALSY_TOGGLE_VALUES = new Set(["off", "disable", "false"]);

const parseToggle = (raw: string | undefined): boolean | null => {
  if (!raw) {
    return null;
  }
  if (TRUTHY_TOGGLE_VALUES.has(raw)) {
    return true;
  }
  if (FALSY_TOGGLE_VALUES.has(raw)) {
    return false;
  }
  return null;
};

const preferences = createPreferences();
const initialPreferences = await preferences.store.load();
let reasoningEnabled = initialPreferences?.reasoningEnabled ?? false;

const getReasoningProviderOptions = () =>
  reasoningEnabled ? { openai: { reasoningEffort: "medium" } } : undefined;

const agent = defineAgent({
  name: "minimal-agent",
  agent: {
    model,
    instructions: "You are a helpful assistant. Be concise.",
    mcp: [{ command: "npx", args: ["-y", "opensearch-mcp@latest"] }],
  },
  history: {
    compaction: { enabled: true, contextLimit: env.AI_CONTEXT_LIMIT },
  },
  onBeforeTurn: () => ({ providerOptions: getReasoningProviderOptions() }),
  commands: [
    {
      name: "new",
      aliases: ["clear", "reset"],
      description: "Start a new session",
      execute: () => ({
        success: true,
        action: { type: "new-session" },
        message: "New session.",
      }),
    },
    {
      name: "reasoning",
      description:
        "Toggle provider-level reasoning (on/off). Persisted across sessions.",
      argumentSuggestions: ["on", "off"],
      execute: async ({ args }) => {
        const raw = args[0]?.toLowerCase();
        if (!raw) {
          return {
            success: true,
            message: `Reasoning is ${reasoningEnabled ? "enabled" : "disabled"}. Usage: /reasoning <on|off>`,
          };
        }
        const next = parseToggle(raw);
        if (next === null) {
          return {
            success: false,
            message: `Invalid argument: ${raw}. Use 'on' or 'off'.`,
          };
        }
        reasoningEnabled = next;
        await preferences.patch({ reasoningEnabled: next });
        return {
          success: true,
          message: `Reasoning ${next ? "enabled" : "disabled"}.`,
        };
      },
    },
  ],
});

const runtime = await createAgentRuntime({
  name: "minimal-agent",
  agents: [agent],
  persistence: { snapshotStore: new FileSnapshotStore(".plugsuits/sessions") },
});
const session = await runtime.openSession();

const prompt = process.argv.find((_, i, arr) => arr[i - 1] === "--prompt");

try {
  if (prompt) {
    await runAgentSessionHeadless(session, {
      initialUserMessage: { content: prompt },
      modelId,
    });
  } else {
    await runAgentSessionTUI(session, {
      header: {
        title: "minimal-agent",
        get subtitle() {
          return `session: ${session.sessionId.slice(0, 8)} · reasoning: ${
            reasoningEnabled ? "on" : "off"
          }`;
        },
      },
      footer: {
        get text() {
          const u = session.history.getContextUsage();
          return u ? formatContextUsage(u) : undefined;
        },
      },
      onCommandAction: async (action) => {
        if (action.type === "new-session") {
          await session.reset();
        }
      },
    });
  }
} finally {
  await session.save();
  await runtime.close();
}
