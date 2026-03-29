import { describe, expect, it } from "vitest";
import type { CheckpointMessage } from "./compaction-types";
import { progressivePrune } from "./tool-pruning";

function requireItem<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

function getFromEnd<T>(items: T[], offset: number): T | undefined {
  return [...items].reverse()[offset - 1];
}

function makeToolMessage(toolName: string, output: string): CheckpointMessage {
  return {
    createdAt: Date.now(),
    id: `${toolName}-${Math.random()}`,
    isSummary: false,
    message: {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolName,
          toolCallId: `${toolName}-call`,
          output: { type: "text", value: output },
        },
      ],
    },
  };
}

describe("progressivePrune eagerPruneToolNames", () => {
  it("prunes read_file outputs even inside the recent protection window", () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeToolMessage("read_file", "x".repeat(4000) + i)
    );

    const result = progressivePrune(messages, {
      enabled: true,
      targetTokens: 100,
      protectRecentTokens: 40_000,
      eagerPruneToolNames: ["read_file"],
    });

    expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
  });

  it("keeps the last two eager-pruned tool outputs intact", () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeToolMessage("read_file", `payload-${i}-${"x".repeat(4000)}`)
    );

    const result = progressivePrune(messages, {
      enabled: true,
      targetTokens: 100,
      protectRecentTokens: 40_000,
      eagerPruneToolNames: ["read_file"],
    });

    const lastMessage = requireItem(
      getFromEnd(result.messages, 1),
      "Missing last message"
    );
    const secondLastMessage = requireItem(
      getFromEnd(result.messages, 2),
      "Missing second last message"
    );

    const last = lastMessage.message.content as Array<{
      output: unknown;
    }>;
    const secondLast = secondLastMessage.message.content as Array<{
      output: unknown;
    }>;

    expect(String((last[0].output as { value: string }).value)).toContain(
      "payload-5"
    );
    expect(String((secondLast[0].output as { value: string }).value)).toContain(
      "payload-4"
    );
  });
});
