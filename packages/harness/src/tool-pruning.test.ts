import type { ModelMessage, ToolCallPart } from "ai";
import { describe, expect, it } from "vitest";
import type { CheckpointMessage } from "./compaction-types";
import { pruneToolOutputs } from "./tool-pruning";

let checkpointId = 0;

function makeCheckpoint(message: ModelMessage): CheckpointMessage {
  checkpointId += 1;

  return {
    createdAt: 1_700_000_000_000 + checkpointId,
    id: `checkpoint_${checkpointId}`,
    isSummary: false,
    message,
  };
}

function makeToolMessage(toolName: string, output: string): CheckpointMessage {
  return makeCheckpoint({
    role: "tool",
    content: [
      {
        type: "tool-result" as const,
        toolCallId: `call_${toolName}`,
        toolName,
        output: { type: "text" as const, value: output },
      },
    ],
  });
}

function makeUserMessage(text: string): CheckpointMessage {
  return makeCheckpoint({ role: "user", content: text });
}

function makeAssistantMessage(text: string): CheckpointMessage {
  return makeCheckpoint({ role: "assistant", content: text });
}

function makeAssistantWithToolCall(toolName: string): CheckpointMessage {
  return makeCheckpoint({
    role: "assistant",
    content: [
      {
        type: "tool-call" as const,
        toolCallId: `call_${toolName}`,
        toolName,
        input: {},
      },
    ],
  });
}

const largeOutput = "x".repeat(5000);
const largeOutputWrapped = { type: "text" as const, value: largeOutput };
const smallOutput = "ok";
const smallOutputWrapped = { type: "text" as const, value: smallOutput };

describe("pruneToolOutputs", () => {
  describe("empty and no-op cases", () => {
    it("returns empty array for empty input", () => {
      const result = pruneToolOutputs([], { enabled: true });
      expect(result.messages).toHaveLength(0);
      expect(result.prunedTokens).toBe(0);
      expect(result.prunedCount).toBe(0);
    });

    it("does not prune when all messages are within protection window", () => {
      const messages: CheckpointMessage[] = [
        makeUserMessage("hello"),
        makeAssistantWithToolCall("read_file"),
        makeToolMessage("read_file", largeOutput),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 100_000,
      });

      expect(result.prunedCount).toBe(0);
      expect(result.prunedTokens).toBe(0);
    });

    it("does not prune non-tool messages", () => {
      const messages: CheckpointMessage[] = [
        makeUserMessage(largeOutput),
        makeAssistantMessage(largeOutput),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 0,
      });

      expect(result.prunedCount).toBe(0);
    });

    it("does not prune small tool outputs", () => {
      const messages: CheckpointMessage[] = [
        makeToolMessage("read_file", smallOutput),
        makeUserMessage("recent"),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 10,
      });

      expect(result.prunedCount).toBe(0);
    });
  });

  describe("basic pruning", () => {
    it("prunes large tool output outside protection window", () => {
      const messages: CheckpointMessage[] = [
        makeUserMessage("read this file"),
        makeAssistantWithToolCall("read_file"),
        makeToolMessage("read_file", largeOutput),
        makeUserMessage("thanks"),
        makeAssistantMessage("you're welcome"),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 100,
        minSavingsTokens: 10,
      });

      expect(result.prunedCount).toBe(1);
      expect(result.prunedTokens).toBeGreaterThan(0);
      expect(result.messages).toHaveLength(5);

      const prunedTool = result.messages[2];
      expect(prunedTool.message.role).toBe("tool");
      const content = prunedTool.message.content as any[];
      expect(content[0].output).toEqual({
        type: "text",
        value: "[output pruned — too large]",
      });
      expect(content[0].compactedAt).toEqual(expect.any(Number));
    });

    it("preserves tool output within protection window", () => {
      const messages: CheckpointMessage[] = [
        makeToolMessage("old_tool", largeOutput),
        makeUserMessage("middle"),
        makeToolMessage("recent_tool", largeOutput),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 2000,
        minSavingsTokens: 10,
      });

      // recent_tool should be protected, old_tool should be pruned
      expect(result.prunedCount).toBe(1);
      const firstTool = result.messages[0].message.content as any[];
      expect(firstTool[0].output).toEqual({
        type: "text",
        value: "[output pruned — too large]",
      });
      expect(firstTool[0].compactedAt).toEqual(expect.any(Number));
      const lastTool = result.messages[2].message.content as any[];
      expect(lastTool[0].output).toEqual(largeOutputWrapped);
    });

    it("uses custom replacement text", () => {
      const customText = "[REDACTED]";
      const messages: CheckpointMessage[] = [
        makeToolMessage("read_file", largeOutput),
        makeUserMessage("recent message with enough tokens"),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 10,
        minSavingsTokens: 10,
        replacementText: customText,
      });

      expect(result.prunedCount).toBe(1);
      const content = result.messages[0].message.content as any[];
      expect(content[0].output).toEqual({ type: "text", value: customText });
      expect(content[0].compactedAt).toEqual(expect.any(Number));
    });
  });

  describe("protected tool names", () => {
    it("does not prune outputs from protected tools", () => {
      const messages: CheckpointMessage[] = [
        makeToolMessage("critical_tool", largeOutput),
        makeToolMessage("regular_tool", largeOutput),
        makeUserMessage("recent"),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 10,
        minSavingsTokens: 10,
        protectedToolNames: ["critical_tool"],
      });

      // Only regular_tool should be pruned
      expect(result.prunedCount).toBe(1);
      const criticalContent = result.messages[0].message.content as any[];
      expect(criticalContent[0].output).toEqual(largeOutputWrapped);
      const regularContent = result.messages[1].message.content as any[];
      expect(regularContent[0].output).toEqual({
        type: "text",
        value: "[output pruned — too large]",
      });
      expect(regularContent[0].compactedAt).toEqual(expect.any(Number));
    });
  });

  describe("minimum savings threshold", () => {
    it("returns original messages when savings below threshold", () => {
      const mediumOutput = "x".repeat(200);
      const messages: CheckpointMessage[] = [
        makeToolMessage("tool", mediumOutput),
        makeUserMessage("recent message".repeat(50)),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 10,
        minSavingsTokens: 99_999,
      });

      expect(result.prunedTokens).toBe(0);
      expect(result.prunedCount).toBe(0);
      expect(result.messages).toBe(messages);
    });
  });

  describe("message immutability", () => {
    it("does not mutate original messages", () => {
      const original: CheckpointMessage[] = [
        makeToolMessage("read_file", largeOutput),
        makeUserMessage("recent"),
      ];

      const originalContent = (original[0].message.content as any[])[0].output;

      pruneToolOutputs(original, {
        enabled: true,
        protectRecentTokens: 10,
        minSavingsTokens: 10,
      });

      expect((original[0].message.content as any[])[0].output).toBe(
        originalContent
      );
    });
  });

  describe("multiple tool results in one message", () => {
    it("prunes individual tool results independently", () => {
      const multiToolMessage = makeCheckpoint({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "call_a",
            toolName: "tool_a",
            output: { type: "text" as const, value: largeOutput },
          },
          {
            type: "tool-result" as const,
            toolCallId: "call_b",
            toolName: "tool_b",
            output: { type: "text" as const, value: smallOutput },
          },
        ],
      });

      const messages: CheckpointMessage[] = [
        multiToolMessage,
        makeUserMessage("recent message".repeat(50)),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 10,
        minSavingsTokens: 10,
      });

      expect(result.prunedCount).toBe(1);
      const content = result.messages[0].message.content as any[];
      expect(content[0].output).toEqual({
        type: "text",
        value: "[output pruned — too large]",
      });
      expect(content[0].compactedAt).toEqual(expect.any(Number));
      expect(content[1].output).toEqual(smallOutputWrapped);
    });
  });

  describe("object outputs", () => {
    it("prunes large object outputs", () => {
      const largeObj = { data: "x".repeat(5000), nested: { key: "value" } };
      const objectToolMessage = makeCheckpoint({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "call_obj",
            toolName: "api_call",
            output: { type: "json" as const, value: largeObj as any },
          },
        ],
      });

      const messages: CheckpointMessage[] = [
        objectToolMessage,
        makeUserMessage("recent message".repeat(50)),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 10,
        minSavingsTokens: 10,
      });

      expect(result.prunedCount).toBe(1);
      const content = result.messages[0].message.content as any[];
      expect(content[0].output).toEqual({
        type: "text",
        value: "[output pruned — too large]",
      });
      expect(content[0].compactedAt).toEqual(expect.any(Number));
    });
  });

  describe("tool topology", () => {
    it("tool-call/result topology preserved after pruning", () => {
      const messages: CheckpointMessage[] = [
        makeUserMessage("load two files"),
        makeAssistantWithToolCall("read_file_a"),
        makeToolMessage("read_file_a", largeOutput),
        makeAssistantWithToolCall("read_file_b"),
        makeToolMessage("read_file_b", largeOutput),
        makeUserMessage("recent message".repeat(50)),
      ];

      const result = pruneToolOutputs(messages, {
        enabled: true,
        protectRecentTokens: 10,
        minSavingsTokens: 10,
      });

      expect(result.prunedCount).toBe(2);

      for (let i = 0; i < result.messages.length; i++) {
        const current = result.messages[i]?.message;
        if (current?.role !== "assistant" || !Array.isArray(current.content)) {
          continue;
        }

        const toolCall = current.content.find(
          (part): part is ToolCallPart =>
            typeof part === "object" &&
            part !== null &&
            "type" in part &&
            part.type === "tool-call"
        );

        if (!toolCall) {
          continue;
        }

        const nextMessage = result.messages[i + 1]?.message;
        expect(nextMessage?.role).toBe("tool");
        expect(Array.isArray(nextMessage?.content)).toBe(true);

        const matchingResult = (nextMessage?.content as any[]).find(
          (part) =>
            part.type === "tool-result" &&
            part.toolCallId === toolCall.toolCallId
        );

        expect(matchingResult).toBeDefined();
        expect(matchingResult.output).toEqual({
          type: "text",
          value: "[output pruned — too large]",
        });
        expect(matchingResult.compactedAt).toEqual(expect.any(Number));
      }
    });
  });

  describe("defaults", () => {
    it("uses default config values when not specified", () => {
      const messages: CheckpointMessage[] = [
        makeToolMessage("tool", largeOutput),
        makeUserMessage("a".repeat(8000)),
      ];

      const result = pruneToolOutputs(messages, { enabled: true });
      expect(result.prunedCount).toBe(1);
      expect(result.prunedTokens).toBeGreaterThan(0);
    });
  });
});
