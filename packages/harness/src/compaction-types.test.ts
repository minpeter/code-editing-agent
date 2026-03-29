import { describe, it, expect } from "vitest";
import type { ModelMessage } from "ai";

// Import all types from the source file
import type {
  Message,
  CheckpointMessage,
  SessionMetadata,
  CompactionConfig,
  PruningConfig,
  ContinuationVariant,
  CompactionResult,
  PreparedCompactionV2,
  ActualTokenUsage,
  ActualTokenUsageInput,
  ContextUsage,
  TodoItem,
  StructuredState,
  SessionHeaderLine,
  MessageLine,
  CheckpointLine,
  SessionFileLine,
  CompactionSummary,
  CompactionSegment,
  PreparedCompactionSegment,
  PreparedCompaction,
} from "./compaction-types";

describe("compaction-types", () => {
  // ============================================
  // Message Interface
  // ============================================
  describe("Message", () => {
    it("should have required fields", () => {
      const message: Message = {
        createdAt: new Date(),
        id: "msg-123",
        modelMessage: { role: "user", content: "Hello" } as ModelMessage,
      };
      expect(message.createdAt).toBeInstanceOf(Date);
      expect(message.id).toBe("msg-123");
      expect(message.modelMessage).toBeDefined();
    });

    it("should allow optional originalContent", () => {
      const messageWithOriginal: Message = {
        createdAt: new Date(),
        id: "msg-123",
        modelMessage: { role: "user", content: "Hello" } as ModelMessage,
        originalContent: "Original text",
      };
      const messageWithoutOriginal: Message = {
        createdAt: new Date(),
        id: "msg-456",
        modelMessage: { role: "user", content: "Hi" } as ModelMessage,
      };
      expect(messageWithOriginal.originalContent).toBe("Original text");
      expect(messageWithoutOriginal.originalContent).toBeUndefined();
    });

    it("should be compatible with type assignments", () => {
      const message: Message = {
        createdAt: new Date("2024-01-01"),
        id: "test-id",
        modelMessage: { role: "assistant", content: "Test" } as ModelMessage,
      };
      const assigned: Message = message;
      expect(assigned.id).toBe("test-id");
    });
  });

  // ============================================
  // CheckpointMessage Interface
  // ============================================
  describe("CheckpointMessage", () => {
    it("should have required fields", () => {
      const checkpoint: CheckpointMessage = {
        createdAt: Date.now(),
        id: "cp-123",
        isSummary: false,
        message: { role: "user", content: "Test" } as ModelMessage,
      };
      expect(checkpoint.createdAt).toBeDefined();
      expect(typeof checkpoint.createdAt).toBe("number");
      expect(checkpoint.id).toBe("cp-123");
      expect(checkpoint.isSummary).toBe(false);
      expect(checkpoint.message).toBeDefined();
    });

    it("should allow optional isSummaryMessage", () => {
      const withFlag: CheckpointMessage = {
        createdAt: Date.now(),
        id: "cp-123",
        isSummary: true,
        isSummaryMessage: true,
        message: { role: "user", content: "Test" } as ModelMessage,
      };
      const withoutFlag: CheckpointMessage = {
        createdAt: Date.now(),
        id: "cp-456",
        isSummary: false,
        message: { role: "user", content: "Test" } as ModelMessage,
      };
      expect(withFlag.isSummaryMessage).toBe(true);
      expect(withoutFlag.isSummaryMessage).toBeUndefined();
    });

    it("should allow optional originalContent", () => {
      const withOriginal: CheckpointMessage = {
        createdAt: Date.now(),
        id: "cp-123",
        isSummary: false,
        message: { role: "user", content: "Test" } as ModelMessage,
        originalContent: "Original",
      };
      expect(withOriginal.originalContent).toBe("Original");
    });

    it("should have correct types for all fields", () => {
      const checkpoint: CheckpointMessage = {
        createdAt: 1704067200000, // timestamp
        id: "nanoid12345",
        isSummary: true,
        message: { role: "assistant", content: [{ type: "text", text: "Response" }] } as ModelMessage,
      };
      expect(typeof checkpoint.createdAt).toBe("number");
      expect(typeof checkpoint.id).toBe("string");
      expect(typeof checkpoint.isSummary).toBe("boolean");
    });
  });

  // ============================================
  // SessionMetadata Interface
  // ============================================
  describe("SessionMetadata", () => {
    it("should have all required fields", () => {
      const metadata: SessionMetadata = {
        completionTokens: 100,
        createdAt: Date.now(),
        promptTokens: 50,
        sessionId: "session-123",
        summaryMessageId: null,
        updatedAt: Date.now(),
      };
      expect(typeof metadata.completionTokens).toBe("number");
      expect(typeof metadata.createdAt).toBe("number");
      expect(typeof metadata.promptTokens).toBe("number");
      expect(typeof metadata.sessionId).toBe("string");
      expect(typeof metadata.summaryMessageId === "string" || metadata.summaryMessageId === null).toBe(true);
      expect(typeof metadata.updatedAt).toBe("number");
    });

    it("should allow summaryMessageId to be null", () => {
      const metadata: SessionMetadata = {
        completionTokens: 0,
        createdAt: Date.now(),
        promptTokens: 0,
        sessionId: "session-new",
        summaryMessageId: null,
        updatedAt: Date.now(),
      };
      expect(metadata.summaryMessageId).toBeNull();
    });

    it("should allow summaryMessageId to be a string", () => {
      const metadata: SessionMetadata = {
        completionTokens: 0,
        createdAt: Date.now(),
        promptTokens: 0,
        sessionId: "session-existing",
        summaryMessageId: "summary-msg-123",
        updatedAt: Date.now(),
      };
      expect(typeof metadata.summaryMessageId).toBe("string");
    });

    it("should handle token values correctly", () => {
      const metadata: SessionMetadata = {
        completionTokens: 5000,
        createdAt: Date.now(),
        promptTokens: 10000,
        sessionId: "session-tokens",
        summaryMessageId: null,
        updatedAt: Date.now(),
      };
      expect(metadata.completionTokens).toBe(5000);
      expect(metadata.promptTokens).toBe(10000);
    });
  });

  // ============================================
  // CompactionConfig Interface
  // ============================================
  describe("CompactionConfig", () => {
    it("should allow empty config (all optional)", () => {
      const config: CompactionConfig = {};
      expect(config).toBeDefined();
    });

    it("should have optional contextLimit with default behavior", () => {
      const config: CompactionConfig = {
        contextLimit: 128000,
      };
      expect(config.contextLimit).toBe(128000);
      expect(typeof config.contextLimit).toBe("number");
    });

    it("should have optional enabled with default behavior", () => {
      const config: CompactionConfig = {
        enabled: true,
      };
      expect(config.enabled).toBe(true);
    });

    it("should allow getStructuredState callback", () => {
      const config: CompactionConfig = {
        getStructuredState: () => "test state",
      };
      expect(config.getStructuredState).toBeDefined();
      expect(typeof config.getStructuredState).toBe("function");
      expect(config.getStructuredState!()).toBe("test state");
    });

    it("should allow getStructuredState to return undefined", () => {
      const config: CompactionConfig = {
        getStructuredState: () => undefined,
      };
      expect(config.getStructuredState!()).toBeUndefined();
    });

    it("should have optional keepRecentTokens with default 2000", () => {
      const config: CompactionConfig = {
        keepRecentTokens: 5000,
      };
      expect(config.keepRecentTokens).toBe(5000);
    });

    it("should have optional maxTokens with default 8000", () => {
      const config: CompactionConfig = {
        maxTokens: 10000,
      };
      expect(config.maxTokens).toBe(10000);
    });

    it("should have optional reserveTokens with default 2000", () => {
      const config: CompactionConfig = {
        reserveTokens: 3000,
      };
      expect(config.reserveTokens).toBe(3000);
    });

    it("should have optional speculativeStartRatio with default 0.5", () => {
      const config: CompactionConfig = {
        speculativeStartRatio: 0.75,
      };
      expect(config.speculativeStartRatio).toBe(0.75);
    });

    it("should allow summarizeFn callback", () => {
      const summarizeFn = async (messages: ModelMessage[], previousSummary?: string) => {
        return "summary";
      };
      const config: CompactionConfig = {
        summarizeFn,
      };
      expect(config.summarizeFn).toBeDefined();
    });

    it("should have optional thresholdRatio with default 0.5", () => {
      const config: CompactionConfig = {
        thresholdRatio: 0.8,
      };
      expect(config.thresholdRatio).toBe(0.8);
    });

    it("should accept all config options together", () => {
      const config: CompactionConfig = {
        contextLimit: 128000,
        enabled: true,
        getStructuredState: () => "state",
        keepRecentTokens: 2000,
        maxTokens: 8000,
        reserveTokens: 2000,
        speculativeStartRatio: 0.5,
        summarizeFn: async () => "summary",
        thresholdRatio: 0.5,
      };
      expect(config.contextLimit).toBe(128000);
      expect(config.enabled).toBe(true);
      expect(config.keepRecentTokens).toBe(2000);
      expect(config.maxTokens).toBe(8000);
      expect(config.reserveTokens).toBe(2000);
      expect(config.speculativeStartRatio).toBe(0.5);
      expect(config.thresholdRatio).toBe(0.5);
    });

    it("should handle zero values correctly", () => {
      const config: CompactionConfig = {
        contextLimit: 0,
        keepRecentTokens: 0,
        maxTokens: 0,
        reserveTokens: 0,
        speculativeStartRatio: 0,
        thresholdRatio: 0,
      };
      expect(config.contextLimit).toBe(0);
      expect(config.keepRecentTokens).toBe(0);
      expect(config.maxTokens).toBe(0);
      expect(config.reserveTokens).toBe(0);
    });
  });

  // ============================================
  // PruningConfig Interface
  // ============================================
  describe("PruningConfig", () => {
    it("should allow empty config (all optional)", () => {
      const config: PruningConfig = {};
      expect(config).toBeDefined();
    });

    it("should have optional eagerPruneToolNames with default []", () => {
      const config: PruningConfig = {
        eagerPruneToolNames: ["tool1", "tool2"],
      };
      expect(config.eagerPruneToolNames).toEqual(["tool1", "tool2"]);
    });

    it("should allow empty eagerPruneToolNames array", () => {
      const config: PruningConfig = {
        eagerPruneToolNames: [],
      };
      expect(config.eagerPruneToolNames).toEqual([]);
    });

    it("should have optional enabled with default false", () => {
      const config: PruningConfig = {
        enabled: true,
      };
      expect(config.enabled).toBe(true);
    });

    it("should have optional minSavingsTokens with default 200", () => {
      const config: PruningConfig = {
        minSavingsTokens: 500,
      };
      expect(config.minSavingsTokens).toBe(500);
    });

    it("should have optional protectedToolNames with default []", () => {
      const config: PruningConfig = {
        protectedToolNames: ["protected-tool"],
      };
      expect(config.protectedToolNames).toEqual(["protected-tool"]);
    });

    it("should have optional protectRecentTokens with default 2000", () => {
      const config: PruningConfig = {
        protectRecentTokens: 3000,
      };
      expect(config.protectRecentTokens).toBe(3000);
    });

    it("should have optional replacementText with default", () => {
      const config: PruningConfig = {
        replacementText: "[custom pruned message]",
      };
      expect(config.replacementText).toBe("[custom pruned message]");
    });

    it("should accept all config options together", () => {
      const config: PruningConfig = {
        eagerPruneToolNames: ["tool1"],
        enabled: true,
        minSavingsTokens: 100,
        protectedToolNames: ["protected"],
        protectRecentTokens: 1000,
        replacementText: "[pruned]",
      };
      expect(config.eagerPruneToolNames).toEqual(["tool1"]);
      expect(config.enabled).toBe(true);
      expect(config.minSavingsTokens).toBe(100);
      expect(config.protectedToolNames).toEqual(["protected"]);
      expect(config.protectRecentTokens).toBe(1000);
      expect(config.replacementText).toBe("[pruned]");
    });
  });

  // ============================================
  // ContinuationVariant Type
  // ============================================
  describe("ContinuationVariant", () => {
    it("should accept 'manual' value", () => {
      const variant: ContinuationVariant = "manual";
      expect(variant).toBe("manual");
    });

    it("should accept 'auto-with-replay' value", () => {
      const variant: ContinuationVariant = "auto-with-replay";
      expect(variant).toBe("auto-with-replay");
    });

    it("should accept 'tool-loop' value", () => {
      const variant: ContinuationVariant = "tool-loop";
      expect(variant).toBe("tool-loop");
    });

    it("should be a union type of literal strings", () => {
      const variants: ContinuationVariant[] = ["manual", "auto-with-replay", "tool-loop"];
      expect(variants).toContain("manual");
      expect(variants).toContain("auto-with-replay");
      expect(variants).toContain("tool-loop");
    });
  });

  // ============================================
  // CompactionResult Interface
  // ============================================
  describe("CompactionResult", () => {
    it("should have required success field", () => {
      const result: CompactionResult = {
        success: true,
        tokensAfter: 5000,
        tokensBefore: 10000,
      };
      expect(result.success).toBe(true);
      expect(typeof result.success).toBe("boolean");
    });

    it("should have required token fields", () => {
      const result: CompactionResult = {
        success: false,
        tokensAfter: 0,
        tokensBefore: 15000,
      };
      expect(typeof result.tokensAfter).toBe("number");
      expect(typeof result.tokensBefore).toBe("number");
    });

    it("should allow optional continuationVariant", () => {
      const result: CompactionResult = {
        success: true,
        tokensAfter: 5000,
        tokensBefore: 10000,
        continuationVariant: "manual",
      };
      expect(result.continuationVariant).toBe("manual");
    });

    it("should allow optional reason", () => {
      const result: CompactionResult = {
        success: false,
        tokensAfter: 10000,
        tokensBefore: 10000,
        reason: "Insufficient tokens to compact",
      };
      expect(result.reason).toBe("Insufficient tokens to compact");
    });

    it("should allow optional summaryMessageId", () => {
      const result: CompactionResult = {
        success: true,
        tokensAfter: 5000,
        tokensBefore: 10000,
        summaryMessageId: "summary-123",
      };
      expect(result.summaryMessageId).toBe("summary-123");
    });

    it("should calculate token delta correctly", () => {
      const result: CompactionResult = {
        success: true,
        tokensAfter: 3000,
        tokensBefore: 10000,
      };
      expect(result.tokensBefore - result.tokensAfter).toBe(7000);
    });
  });

  // ============================================
  // PreparedCompactionV2 Interface
  // ============================================
  describe("PreparedCompactionV2", () => {
    it("should have all required fields", () => {
      const compaction: PreparedCompactionV2 = {
        baseMessageIds: ["msg-1", "msg-2"],
        revision: 1,
        splitIndex: 5,
        summaryText: "Summary of messages",
        tokenDelta: 5000,
      };
      expect(compaction.baseMessageIds).toEqual(["msg-1", "msg-2"]);
      expect(typeof compaction.revision).toBe("number");
      expect(typeof compaction.splitIndex).toBe("number");
      expect(typeof compaction.summaryText).toBe("string");
      expect(typeof compaction.tokenDelta).toBe("number");
    });

    it("should allow optional replayMessage", () => {
      const compaction: PreparedCompactionV2 = {
        baseMessageIds: ["msg-1"],
        revision: 1,
        splitIndex: 3,
        summaryText: "Summary",
        tokenDelta: 1000,
        replayMessage: {
          createdAt: Date.now(),
          id: "replay-msg",
          isSummary: true,
          message: { role: "user", content: "test" } as ModelMessage,
        },
      };
      expect(compaction.replayMessage).toBeDefined();
      expect(compaction.replayMessage!.id).toBe("replay-msg");
    });

    it("should handle empty baseMessageIds", () => {
      const compaction: PreparedCompactionV2 = {
        baseMessageIds: [],
        revision: 0,
        splitIndex: 0,
        summaryText: "",
        tokenDelta: 0,
      };
      expect(compaction.baseMessageIds).toEqual([]);
    });
  });

  // ============================================
  // ActualTokenUsage Interface
  // ============================================
  describe("ActualTokenUsage", () => {
    it("should have all required fields", () => {
      const usage: ActualTokenUsage = {
        completionTokens: 100,
        promptTokens: 50,
        totalTokens: 150,
        updatedAt: new Date(),
      };
      expect(typeof usage.completionTokens).toBe("number");
      expect(typeof usage.promptTokens).toBe("number");
      expect(typeof usage.totalTokens).toBe("number");
      expect(usage.updatedAt).toBeInstanceOf(Date);
    });

    it("should have totalTokens equal to sum of prompt and completion", () => {
      const usage: ActualTokenUsage = {
        completionTokens: 200,
        promptTokens: 300,
        totalTokens: 500,
        updatedAt: new Date(),
      };
      expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
    });

    it("should handle zero values", () => {
      const usage: ActualTokenUsage = {
        completionTokens: 0,
        promptTokens: 0,
        totalTokens: 0,
        updatedAt: new Date(),
      };
      expect(usage.totalTokens).toBe(0);
    });
  });

  // ============================================
  // ActualTokenUsageInput Interface
  // ============================================
  describe("ActualTokenUsageInput", () => {
    it("should allow empty input (all optional)", () => {
      const input: ActualTokenUsageInput = {};
      expect(input).toBeDefined();
    });

    it("should allow optional completionTokens", () => {
      const input: ActualTokenUsageInput = {
        completionTokens: 100,
      };
      expect(input.completionTokens).toBe(100);
    });

    it("should allow optional inputTokens", () => {
      const input: ActualTokenUsageInput = {
        inputTokens: 200,
      };
      expect(input.inputTokens).toBe(200);
    });

    it("should allow optional outputTokens", () => {
      const input: ActualTokenUsageInput = {
        outputTokens: 150,
      };
      expect(input.outputTokens).toBe(150);
    });

    it("should allow optional promptTokens", () => {
      const input: ActualTokenUsageInput = {
        promptTokens: 250,
      };
      expect(input.promptTokens).toBe(250);
    });

    it("should allow optional totalTokens", () => {
      const input: ActualTokenUsageInput = {
        totalTokens: 500,
      };
      expect(input.totalTokens).toBe(500);
    });

    it("should allow optional updatedAt", () => {
      const input: ActualTokenUsageInput = {
        updatedAt: new Date("2024-01-01"),
      };
      expect(input.updatedAt).toBeInstanceOf(Date);
    });

    it("should accept all fields together", () => {
      const input: ActualTokenUsageInput = {
        completionTokens: 100,
        inputTokens: 200,
        outputTokens: 150,
        promptTokens: 250,
        totalTokens: 500,
        updatedAt: new Date(),
      };
      expect(input.completionTokens).toBe(100);
      expect(input.inputTokens).toBe(200);
      expect(input.outputTokens).toBe(150);
      expect(input.promptTokens).toBe(250);
      expect(input.totalTokens).toBe(500);
    });
  });

  // ============================================
  // ContextUsage Interface
  // ============================================
  describe("ContextUsage", () => {
    it("should have all required fields", () => {
      const usage: ContextUsage = {
        limit: 128000,
        percentage: 50,
        remaining: 64000,
        source: "actual",
        used: 64000,
      };
      expect(typeof usage.limit).toBe("number");
      expect(typeof usage.percentage).toBe("number");
      expect(typeof usage.remaining).toBe("number");
      expect(typeof usage.source).toBe("string");
      expect(typeof usage.used).toBe("number");
    });

    it("should accept source as 'actual'", () => {
      const usage: ContextUsage = {
        limit: 128000,
        percentage: 75,
        remaining: 32000,
        source: "actual",
        used: 96000,
      };
      expect(usage.source).toBe("actual");
    });

    it("should accept source as 'estimated'", () => {
      const usage: ContextUsage = {
        limit: 128000,
        percentage: 60,
        remaining: 51200,
        source: "estimated",
        used: 76800,
      };
      expect(usage.source).toBe("estimated");
    });

    it("should have percentage between 0-100", () => {
      const usage: ContextUsage = {
        limit: 128000,
        percentage: 0,
        remaining: 128000,
        source: "actual",
        used: 0,
      };
      expect(usage.percentage).toBe(0);

      const usage100: ContextUsage = {
        limit: 128000,
        percentage: 100,
        remaining: 0,
        source: "actual",
        used: 128000,
      };
      expect(usage100.percentage).toBe(100);
    });

    it("should calculate remaining correctly", () => {
      const usage: ContextUsage = {
        limit: 100000,
        percentage: 30,
        remaining: 70000,
        source: "actual",
        used: 30000,
      };
      expect(usage.remaining).toBe(usage.limit - usage.used);
    });
  });

  // ============================================
  // TodoItem Interface
  // ============================================
  describe("TodoItem", () => {
    it("should have all required fields", () => {
      const todo: TodoItem = {
        content: "Complete task",
        status: "pending",
      };
      expect(typeof todo.content).toBe("string");
      expect(typeof todo.status).toBe("string");
    });

    it("should accept 'pending' status", () => {
      const todo: TodoItem = {
        content: "Task 1",
        status: "pending",
      };
      expect(todo.status).toBe("pending");
    });

    it("should accept 'in_progress' status", () => {
      const todo: TodoItem = {
        content: "Task 2",
        status: "in_progress",
      };
      expect(todo.status).toBe("in_progress");
    });

    it("should accept 'completed' status", () => {
      const todo: TodoItem = {
        content: "Task 3",
        status: "completed",
      };
      expect(todo.status).toBe("completed");
    });

    it("should accept 'cancelled' status", () => {
      const todo: TodoItem = {
        content: "Task 4",
        status: "cancelled",
      };
      expect(todo.status).toBe("cancelled");
    });
  });

  // ============================================
  // StructuredState Interface
  // ============================================
  describe("StructuredState", () => {
    it("should allow empty state (all optional)", () => {
      const state: StructuredState = {};
      expect(state).toBeDefined();
    });

    it("should allow optional metadata", () => {
      const state: StructuredState = {
        metadata: { key: "value", count: 42 },
      };
      expect(state.metadata).toEqual({ key: "value", count: 42 });
    });

    it("should allow optional todos", () => {
      const state: StructuredState = {
        todos: [
          { content: "Task 1", status: "pending" },
          { content: "Task 2", status: "completed" },
        ],
      };
      expect(state.todos).toHaveLength(2);
      expect(state.todos![0].content).toBe("Task 1");
    });

    it("should allow both metadata and todos", () => {
      const state: StructuredState = {
        metadata: { version: "1.0" },
        todos: [{ content: "Test", status: "in_progress" }],
      };
      expect(state.metadata).toBeDefined();
      expect(state.todos).toBeDefined();
    });

    it("should allow empty metadata and todos arrays", () => {
      const state: StructuredState = {
        metadata: {},
        todos: [],
      };
      expect(state.metadata).toEqual({});
      expect(state.todos).toEqual([]);
    });
  });

  // ============================================
  // SessionHeaderLine Interface
  // ============================================
  describe("SessionHeaderLine", () => {
    it("should have all required fields", () => {
      const header: SessionHeaderLine = {
        createdAt: Date.now(),
        sessionId: "session-123",
        type: "header",
        version: 1,
      };
      expect(typeof header.createdAt).toBe("number");
      expect(typeof header.sessionId).toBe("string");
      expect(header.type).toBe("header");
      expect(header.version).toBe(1);
    });

    it("should have version as 1", () => {
      const header: SessionHeaderLine = {
        createdAt: Date.now(),
        sessionId: "session-456",
        type: "header",
        version: 1,
      };
      expect(header.version).toBe(1);
    });
  });

  // ============================================
  // MessageLine Interface
  // ============================================
  describe("MessageLine", () => {
    it("should have all required fields", () => {
      const line: MessageLine = {
        createdAt: Date.now(),
        id: "msg-123",
        isSummary: false,
        message: { role: "user", content: "Hello" } as ModelMessage,
        type: "message",
      };
      expect(typeof line.createdAt).toBe("number");
      expect(typeof line.id).toBe("string");
      expect(typeof line.isSummary).toBe("boolean");
      expect(line.message).toBeDefined();
      expect(line.type).toBe("message");
    });

    it("should allow optional originalContent", () => {
      const line: MessageLine = {
        createdAt: Date.now(),
        id: "msg-456",
        isSummary: true,
        message: { role: "assistant", content: "Summary" } as ModelMessage,
        originalContent: "Original summary text",
        type: "message",
      };
      expect(line.originalContent).toBe("Original summary text");
    });

    it("should handle isSummary correctly", () => {
      const summaryLine: MessageLine = {
        createdAt: Date.now(),
        id: "summary-1",
        isSummary: true,
        message: { role: "user", content: "Summary" } as ModelMessage,
        type: "message",
      };
      expect(summaryLine.isSummary).toBe(true);
    });
  });

  // ============================================
  // CheckpointLine Interface
  // ============================================
  describe("CheckpointLine", () => {
    it("should have all required fields", () => {
      const checkpoint: CheckpointLine = {
        summaryMessageId: "summary-123",
        type: "checkpoint",
        updatedAt: Date.now(),
      };
      expect(typeof checkpoint.summaryMessageId).toBe("string");
      expect(checkpoint.type).toBe("checkpoint");
      expect(typeof checkpoint.updatedAt).toBe("number");
    });

    it("should link to correct summary message", () => {
      const checkpoint: CheckpointLine = {
        summaryMessageId: "summary-msg-456",
        type: "checkpoint",
        updatedAt: Date.now(),
      };
      expect(checkpoint.summaryMessageId).toBe("summary-msg-456");
    });
  });

  // ============================================
  // SessionFileLine Type
  // ============================================
  describe("SessionFileLine", () => {
    it("should accept SessionHeaderLine", () => {
      const line: SessionFileLine = {
        createdAt: Date.now(),
        sessionId: "session-123",
        type: "header",
        version: 1,
      };
      expect(line.type).toBe("header");
    });

    it("should accept MessageLine", () => {
      const line: SessionFileLine = {
        createdAt: Date.now(),
        id: "msg-123",
        isSummary: false,
        message: { role: "user", content: "Hello" } as ModelMessage,
        type: "message",
      };
      expect(line.type).toBe("message");
    });

    it("should accept CheckpointLine", () => {
      const line: SessionFileLine = {
        summaryMessageId: "summary-123",
        type: "checkpoint",
        updatedAt: Date.now(),
      };
      expect(line.type).toBe("checkpoint");
    });

    it("should discriminate by type field", () => {
      const headerLine: SessionFileLine = {
        createdAt: Date.now(),
        sessionId: "session-1",
        type: "header",
        version: 1,
      };
      const messageLine: SessionFileLine = {
        createdAt: Date.now(),
        id: "msg-1",
        isSummary: false,
        message: { role: "user", content: "test" } as ModelMessage,
        type: "message",
      };
      const checkpointLine: SessionFileLine = {
        summaryMessageId: "sum-1",
        type: "checkpoint",
        updatedAt: Date.now(),
      };

      expect(headerLine.type).toBe("messageLine" in headerLine ? "message" : "header");
      expect(messageLine.type).toBe("message");
      expect(checkpointLine.type).toBe("checkpoint");
    });
  });

  // ============================================
  // CompactionSummary Interface
  // ============================================
  describe("CompactionSummary", () => {
    it("should have all required fields", () => {
      const summary: CompactionSummary = {
        createdAt: new Date(),
        firstKeptMessageId: "msg-10",
        id: "summary-123",
        summary: "Compacted summary text",
        summaryTokens: 500,
        tokensBefore: 10000,
      };
      expect(summary.createdAt).toBeInstanceOf(Date);
      expect(typeof summary.firstKeptMessageId).toBe("string");
      expect(typeof summary.id).toBe("string");
      expect(typeof summary.summary).toBe("string");
      expect(typeof summary.summaryTokens).toBe("number");
      expect(typeof summary.tokensBefore).toBe("number");
    });

    it("should track token savings", () => {
      const summary: CompactionSummary = {
        createdAt: new Date(),
        firstKeptMessageId: "msg-5",
        id: "summary-456",
        summary: "Summary",
        summaryTokens: 300,
        tokensBefore: 8000,
      };
      expect(summary.tokensBefore - summary.summaryTokens).toBeGreaterThan(0);
    });
  });

  // ============================================
  // CompactionSegment Interface
  // ============================================
  describe("CompactionSegment", () => {
    it("should have all required fields", () => {
      const segment: CompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-20",
        estimatedTokens: 5000,
        id: "segment-1",
        messageCount: 10,
        messageIds: ["msg-1", "msg-2", "msg-3"],
        messages: [],
        startMessageId: "msg-1",
        summary: null,
      };
      expect(segment.createdAt).toBeInstanceOf(Date);
      expect(typeof segment.endMessageId).toBe("string");
      expect(typeof segment.estimatedTokens).toBe("number");
      expect(typeof segment.id).toBe("string");
      expect(typeof segment.messageCount).toBe("number");
      expect(Array.isArray(segment.messageIds)).toBe(true);
      expect(Array.isArray(segment.messages)).toBe(true);
      expect(typeof segment.startMessageId).toBe("string");
      expect(segment.summary).toBeNull();
    });

    it("should allow CompactionSummary in summary field", () => {
      const summary: CompactionSummary = {
        createdAt: new Date(),
        firstKeptMessageId: "msg-10",
        id: "summary-1",
        summary: "Test summary",
        summaryTokens: 100,
        tokensBefore: 5000,
      };
      const segment: CompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-15",
        estimatedTokens: 3000,
        id: "segment-2",
        messageCount: 5,
        messageIds: ["msg-10", "msg-11"],
        messages: [],
        startMessageId: "msg-10",
        summary,
      };
      expect(segment.summary).not.toBeNull();
      expect(segment.summary!.id).toBe("summary-1");
    });

    it("should handle empty messages array", () => {
      const segment: CompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-5",
        estimatedTokens: 0,
        id: "segment-empty",
        messageCount: 0,
        messageIds: [],
        messages: [],
        startMessageId: "msg-5",
        summary: null,
      };
      expect(segment.messages).toEqual([]);
      expect(segment.messageIds).toEqual([]);
    });
  });

  // ============================================
  // PreparedCompactionSegment Interface
  // ============================================
  describe("PreparedCompactionSegment", () => {
    it("should have all required fields", () => {
      const segment: PreparedCompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-20",
        estimatedTokens: 5000,
        id: "segment-1",
        messageCount: 10,
        messageIds: ["msg-1", "msg-2"],
        messages: [],
        startMessageId: "msg-1",
        summary: null,
      };
      expect(segment.createdAt).toBeInstanceOf(Date);
      expect(typeof segment.endMessageId).toBe("string");
      expect(typeof segment.estimatedTokens).toBe("number");
      expect(typeof segment.id).toBe("string");
      expect(typeof segment.messageCount).toBe("number");
      expect(Array.isArray(segment.messageIds)).toBe(true);
      expect(Array.isArray(segment.messages)).toBe(true);
      expect(typeof segment.startMessageId).toBe("string");
    });

    it("should be compatible with CompactionSegment", () => {
      const prepared: PreparedCompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-10",
        estimatedTokens: 2000,
        id: "prepared-1",
        messageCount: 5,
        messageIds: ["msg-1", "msg-2"],
        messages: [],
        startMessageId: "msg-1",
        summary: null,
      };
      const compact: CompactionSegment = prepared;
      expect(compact.id).toBe("prepared-1");
    });
  });

  // ============================================
  // PreparedCompaction Interface
  // ============================================
  describe("PreparedCompaction", () => {
    it("should have all required fields", () => {
      const compaction: PreparedCompaction = {
        actualUsage: null,
        baseMessageIds: ["msg-1", "msg-2"],
        baseRevision: 1,
        baseSegmentIds: ["seg-1"],
        compactionMaxTokensAtCreation: 8000,
        contextLimitAtCreation: 128000,
        didChange: false,
        keepRecentTokensAtCreation: 2000,
        pendingCompaction: false,
        phase: "new-turn",
        rejected: false,
        segments: [],
        tokenDelta: 0,
      };
      expect(compaction.actualUsage).toBeNull();
      expect(Array.isArray(compaction.baseMessageIds)).toBe(true);
      expect(typeof compaction.baseRevision).toBe("number");
      expect(Array.isArray(compaction.baseSegmentIds)).toBe(true);
      expect(typeof compaction.compactionMaxTokensAtCreation).toBe("number");
      expect(typeof compaction.contextLimitAtCreation).toBe("number");
      expect(typeof compaction.didChange).toBe("boolean");
      expect(typeof compaction.keepRecentTokensAtCreation).toBe("number");
      expect(typeof compaction.pendingCompaction).toBe("boolean");
      expect(typeof compaction.phase).toBe("string");
      expect(typeof compaction.rejected).toBe("boolean");
      expect(Array.isArray(compaction.segments)).toBe(true);
      expect(typeof compaction.tokenDelta).toBe("number");
    });

    it("should accept actualUsage with ActualTokenUsage", () => {
      const usage: ActualTokenUsage = {
        completionTokens: 100,
        promptTokens: 200,
        totalTokens: 300,
        updatedAt: new Date(),
      };
      const compaction: PreparedCompaction = {
        actualUsage: usage,
        baseMessageIds: [],
        baseRevision: 1,
        baseSegmentIds: [],
        compactionMaxTokensAtCreation: 8000,
        contextLimitAtCreation: 128000,
        didChange: true,
        keepRecentTokensAtCreation: 2000,
        pendingCompaction: true,
        phase: "intermediate-step",
        rejected: false,
        segments: [],
        tokenDelta: 500,
      };
      expect(compaction.actualUsage).not.toBeNull();
      expect(compaction.actualUsage!.totalTokens).toBe(300);
    });

    it("should accept 'intermediate-step' phase", () => {
      const compaction: PreparedCompaction = {
        actualUsage: null,
        baseMessageIds: [],
        baseRevision: 1,
        baseSegmentIds: [],
        compactionMaxTokensAtCreation: 8000,
        contextLimitAtCreation: 128000,
        didChange: false,
        keepRecentTokensAtCreation: 2000,
        pendingCompaction: false,
        phase: "intermediate-step",
        rejected: false,
        segments: [],
        tokenDelta: 0,
      };
      expect(compaction.phase).toBe("intermediate-step");
    });

    it("should accept 'new-turn' phase", () => {
      const compaction: PreparedCompaction = {
        actualUsage: null,
        baseMessageIds: [],
        baseRevision: 1,
        baseSegmentIds: [],
        compactionMaxTokensAtCreation: 8000,
        contextLimitAtCreation: 128000,
        didChange: false,
        keepRecentTokensAtCreation: 2000,
        pendingCompaction: false,
        phase: "new-turn",
        rejected: false,
        segments: [],
        tokenDelta: 0,
      };
      expect(compaction.phase).toBe("new-turn");
    });

    it("should handle rejected compaction", () => {
      const compaction: PreparedCompaction = {
        actualUsage: null,
        baseMessageIds: [],
        baseRevision: 1,
        baseSegmentIds: [],
        compactionMaxTokensAtCreation: 8000,
        contextLimitAtCreation: 128000,
        didChange: false,
        keepRecentTokensAtCreation: 2000,
        pendingCompaction: false,
        phase: "new-turn",
        rejected: true,
        segments: [],
        tokenDelta: 0,
      };
      expect(compaction.rejected).toBe(true);
    });

    it("should accept segments with PreparedCompactionSegment", () => {
      const segment: PreparedCompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-10",
        estimatedTokens: 2000,
        id: "seg-1",
        messageCount: 5,
        messageIds: ["msg-1", "msg-2"],
        messages: [],
        startMessageId: "msg-1",
        summary: null,
      };
      const compaction: PreparedCompaction = {
        actualUsage: null,
        baseMessageIds: [],
        baseRevision: 1,
        baseSegmentIds: ["seg-1"],
        compactionMaxTokensAtCreation: 8000,
        contextLimitAtCreation: 128000,
        didChange: true,
        keepRecentTokensAtCreation: 2000,
        pendingCompaction: true,
        phase: "new-turn",
        rejected: false,
        segments: [segment],
        tokenDelta: 1000,
      };
      expect(compaction.segments).toHaveLength(1);
      expect(compaction.segments[0].id).toBe("seg-1");
    });
  });

  // ============================================
  // Type Compatibility Tests
  // ============================================
  describe("Type Compatibility", () => {
    it("Message should be compatible with CheckpointMessage", () => {
      const message: Message = {
        createdAt: new Date(),
        id: "msg-123",
        modelMessage: { role: "user", content: "test" } as ModelMessage,
      };
      const checkpoint: CheckpointMessage = {
        createdAt: message.createdAt.getTime(),
        id: message.id,
        isSummary: false,
        message: message.modelMessage,
      };
      expect(checkpoint.id).toBe(message.id);
    });

    it("PreparedCompactionSegment should be assignable to CompactionSegment", () => {
      const prepared: PreparedCompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-10",
        estimatedTokens: 1000,
        id: "seg-1",
        messageCount: 3,
        messageIds: ["msg-1", "msg-2"],
        messages: [],
        startMessageId: "msg-1",
        summary: null,
      };
      const compact: CompactionSegment = prepared;
      expect(compact.id).toBe("seg-1");
    });

    it("SessionFileLine union should discriminate correctly", () => {
      const header: SessionFileLine = {
        createdAt: Date.now(),
        sessionId: "session-1",
        type: "header",
        version: 1,
      };
      const message: SessionFileLine = {
        createdAt: Date.now(),
        id: "msg-1",
        isSummary: false,
        message: { role: "user", content: "test" } as ModelMessage,
        type: "message",
      };
      const checkpoint: SessionFileLine = {
        summaryMessageId: "sum-1",
        type: "checkpoint",
        updatedAt: Date.now(),
      };

      expect(header.type).toBe("header");
      expect(message.type).toBe("message");
      expect(checkpoint.type).toBe("checkpoint");
    });

    it("ActualTokenUsageInput should be assignable to ActualTokenUsage", () => {
      const input: ActualTokenUsageInput = {
        completionTokens: 100,
        promptTokens: 200,
        totalTokens: 300,
        updatedAt: new Date(),
      };
      const usage: ActualTokenUsage = {
        completionTokens: input.completionTokens ?? 0,
        promptTokens: input.promptTokens ?? 0,
        totalTokens: input.totalTokens ?? 0,
        updatedAt: input.updatedAt ?? new Date(),
      };
      expect(usage.totalTokens).toBe(300);
    });

    it("CompactionConfig should accept partial configuration", () => {
      const minimalConfig: CompactionConfig = {
        enabled: true,
      };
      const fullConfig: CompactionConfig = {
        contextLimit: 128000,
        enabled: true,
        getStructuredState: () => "state",
        keepRecentTokens: 2000,
        maxTokens: 8000,
        reserveTokens: 2000,
        speculativeStartRatio: 0.5,
        summarizeFn: async () => "summary",
        thresholdRatio: 0.5,
      };
      expect(minimalConfig.enabled).toBe(true);
      expect(fullConfig.contextLimit).toBe(128000);
    });

    it("PruningConfig should accept partial configuration", () => {
      const minimalConfig: PruningConfig = {
        enabled: true,
      };
      const fullConfig: PruningConfig = {
        eagerPruneToolNames: ["tool1"],
        enabled: true,
        minSavingsTokens: 100,
        protectedToolNames: ["protected"],
        protectRecentTokens: 1000,
        replacementText: "[pruned]",
      };
      expect(minimalConfig.enabled).toBe(true);
      expect(fullConfig.eagerPruneToolNames).toEqual(["tool1"]);
    });
  });
});
