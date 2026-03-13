import type { ModelMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const payloadState = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
}));

const mockedStreamText = vi.fn((options: Record<string, unknown>) => {
  payloadState.calls.push(options);

  return {
    finishReason: Promise.resolve("stop"),
    fullStream: {} as never,
    response: Promise.resolve({ messages: [] }),
    usage: Promise.resolve(undefined),
    totalUsage: Promise.resolve(undefined),
  } as never;
});

vi.mock("ai", async () => {
  const actualAi = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actualAi,
    streamText: mockedStreamText,
    wrapLanguageModel: ({ model }: { model: unknown }) => model,
  };
});

const { MessageHistory } = await import("@ai-sdk-tool/harness");
const { AgentManager } = await import("./agent");

function getLast<T>(values: T[]): T | null {
  return values.length > 0 ? ([...values].pop() ?? null) : null;
}

const createFriendliStub = () => {
  return ((modelId: string) => ({ modelId })) as never;
};

async function capturePayloadFromHistory(
  history: InstanceType<typeof MessageHistory>
) {
  const manager = new AgentManager(createFriendliStub(), null);
  manager.setProvider("friendli");
  manager.setModelId("MiniMaxAI/MiniMax-M2.5");

  const messages = history.getMessagesForLLM();
  await manager.stream(messages);

  return getLast(payloadState.calls);
}

describe("AgentManager Friendli payload E2E", () => {
  beforeEach(() => {
    payloadState.calls.length = 0;
    mockedStreamText.mockClear();
  });

  it("sends compacted MiniMax payload with valid message content shapes", async () => {
    const history = new MessageHistory({
      compaction: {
        enabled: true,
        maxTokens: 16,
        reserveTokens: 1,
        keepRecentTokens: 1,
        summarizeFn: async () => "rolled up summary",
      },
    });

    history.addUserMessage("one two three four five six");
    history.addModelMessages([
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "internal chain" },
          { type: "text", text: "final answer" },
        ],
      } as ModelMessage,
    ]);
    history.addUserMessage("latest user turn");
    await history.compact({ aggressive: true });

    const payload = await capturePayloadFromHistory(history);

    expect(payload).not.toBeNull();
    expect(payload?.system).toEqual(expect.any(String));

    const messages = (payload?.messages ?? []) as ModelMessage[];
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.role).toBe("system");

    for (const message of messages) {
      expect(
        typeof message.content === "string" || Array.isArray(message.content)
      ).toBe(true);
      expect(
        (message as Record<string, unknown>).reasoning_content
      ).toBeUndefined();
    }
  });

  it("preserves a valid assistant-tool pair in the final payload under zero-budget truncation", async () => {
    const history = new MessageHistory({
      compaction: {
        enabled: true,
        maxTokens: 100,
        reserveTokens: 999,
        keepRecentTokens: 20,
        summarizeFn: async () => "summary",
      },
    });

    history.setContextLimit(10);
    history.addUserMessage("question");
    history.addModelMessages([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-preserve",
            toolName: "test_tool",
            input: {},
          },
        ],
      } as ModelMessage,
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tc-preserve",
            toolName: "test_tool",
            output: { type: "text", value: "output" },
          },
        ],
      } as ModelMessage,
    ]);

    const payload = await capturePayloadFromHistory(history);
    const messages = (payload?.messages ?? []) as ModelMessage[];

    expect(messages.map((message) => message.role)).toEqual([
      "assistant",
      "tool",
    ]);
  });
});
