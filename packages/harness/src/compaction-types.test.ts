import { describe, it, expect } from "vitest";
import type { ModelMessage } from "ai";
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
  // 1. Message Interface
  // ============================================
  describe("Message", () => {
    it("should have all required fields", () => {
      const message: Message = {
        createdAt: new Date(),
        id: "msg-123",
        modelMessage: { role: "user", content: "Hello" } as ModelMessage,
      };
      expect(message.createdAt).toBeInstanceOf(Date);
      expect(message.id).toBe("msg-123");
      expect(message.modelMessage).toBeDefined();
    });

    it("should allow optional originalContent field", () => {
      const message: Message = {
        createdAt: new Date(),
        id: "msg-123",
        modelMessage: { role: "user", content: "Hello" } as ModelMessage,
        originalContent: "original text",
      };
      expect(message.originalContent).toBe("original text");
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidMessage: Message = {};
      expect(invalidMessage.createdAt).toBeUndefined();
    });

    it("should accept Date type for createdAt", () => {
      const message: Message = {
        createdAt: new Date("2024-01-01"),
        id: "msg-123",
        modelMessage: { role: "user", content: "Hello" } as ModelMessage,
      };
      expect(message.createdAt).toEqual(new Date("2024-01-01"));
    });

    it("should have correct types for all fields", () => {
      const message: Message = {
        createdAt: new Date(),
        id: "test-id",
        modelMessage: { role: "assistant", content: [{ type: "text", text: "test" }] } as ModelMessage,
        originalContent: "original",
      };
      expect(typeof message.id).toBe("string");
      expect(typeof message.originalContent).toBe("string");
    });
  });

  // ============================================
  // 2. CheckpointMessage Interface
  // ============================================
  describe("CheckpointMessage", () => {
    it("should have all required fields", () => {
      const checkpoint: CheckpointMessage = {
        createdAt: Date.now(),
        id: "checkpoint-1",
        isSummary: false,
        message: { role: "user", content: "Test" } as ModelMessage,
      };
      expect(checkpoint.createdAt).toBeDefined();
      expect(checkpoint.id).toBe("checkpoint-1");
      expect(checkpoint.isSummary).toBe(false);
      expect(checkpoint.message).toBeDefined();
    });

    it("should accept optional isSummaryMessage field", () => {
      const checkpoint: CheckpointMessage = {
        createdAt: Date.now(),
        id: "checkpoint-1",
        isSummary: true,
        isSummaryMessage: true,
        message: { role: "user", content: "Test" } as ModelMessage,
      };
      expect(checkpoint.isSummaryMessage).toBe(true);
    });

    it("should accept optional originalContent field", () => {
      const checkpoint: CheckpointMessage = {
        createdAt: Date.now(),
        id: "checkpoint-1",
        isSummary: false,
        message: { role: "user", content: "Test" } as ModelMessage,
        originalContent: "original",
      };
      expect(checkpoint.originalContent).toBe("original");
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidCheckpoint: CheckpointMessage = {};
      expect(invalidCheckpoint.createdAt).toBeUndefined();
    });

    it("should have correct types for createdAt (number)", () => {
      const checkpoint: CheckpointMessage = {
        createdAt: Date.now(),
        id: "test-id",
        isSummary: true,
        message: { role: "assistant", content: "response" } as ModelMessage,
      };
      expect(typeof checkpoint.createdAt).toBe("number");
    });
  });

  // ============================================
  // 3. SessionMetadata Interface
  // ============================================
  describe("SessionMetadata", () => {
    it("should have all required fields", () => {
      const metadata: SessionMetadata = {
        completionTokens: 100,
        createdAt: Date.now(),
        promptTokens: 50,
        sessionId: "session-1",
        summaryMessageId: null,
        updatedAt: Date.now(),
      };
      expect(metadata.completionTokens).toBe(100);
      expect(metadata.promptTokens).toBe(50);
      expect(metadata.sessionId).toBe("session-1");
      expect(metadata.summaryMessageId).toBeNull();
    });

    it("should accept string for summaryMessageId", () => {
      const metadata: SessionMetadata = {
        completionTokens: 100,
        createdAt: Date.now(),
        promptTokens: 50,
        sessionId: "session-1",
        summaryMessageId: "summary-123",
        updatedAt: Date.now(),
      };
      expect(metadata.summaryMessageId).toBe("summary-123");
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidMetadata: SessionMetadata = {};
      expect(invalidMetadata.completionTokens).toBeUndefined();
    });

    it("should have correct numeric types", () => {
      const metadata: SessionMetadata = {
        completionTokens: 0,
        createdAt: 0,
        promptTokens: 0,
        sessionId: "",
        summaryMessageId: null,
        updatedAt: 0,
      };
      expect(typeof metadata.completionTokens).toBe("number");
      expect(typeof metadata.promptTokens).toBe("number");
      expect(typeof metadata.createdAt).toBe("number");
    });
  });

  // ============================================
  // 4. CompactionConfig Interface
  // ============================================
  describe("CompactionConfig", () => {
    it("should accept empty object with all optional fields", () => {
      const config: CompactionConfig = {};
      expect(config.contextLimit).toBeUndefined();
      expect(config.enabled).toBeUndefined();
    });

    it("should accept all optional fields", () => {
      const config: CompactionConfig = {
        contextLimit: 128000,
        enabled: true,
        getStructuredState: () => "state",
        keepRecentTokens: 2000,
        maxTokens: 8000,
        reserveTokens: 2000,
        speculativeStartRatio: 0.5,
        summarizeFn: async (msgs) => "summary",
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

    it("should have correct default values (documented)", () => {
      const config: CompactionConfig = {};
      // Documented defaults
      expect(config.contextLimit).toBeUndefined(); // 128000 when set
      expect(config.enabled).toBeUndefined(); // false when set
      expect(config.keepRecentTokens).toBeUndefined(); // 2000 when set
      expect(config.maxTokens).toBeUndefined(); // 8000 when set
      expect(config.reserveTokens).toBeUndefined(); // 2000 when set
      expect(config.speculativeStartRatio).toBeUndefined(); // 0.5 when set
      expect(config.thresholdRatio).toBeUndefined(); // 0.5 when set
    });

    it("should accept getStructuredState callback", () => {
      const config: CompactionConfig = {
        getStructuredState: () => "<structured-state>test</structured-state>",
      };
      expect(config.getStructuredState).toBeDefined();
      expect(typeof config.getStructuredState).toBe("function");
    });

    it("should accept summarizeFn callback", () => {
      const config: CompactionConfig = {
        summarizeFn: async (messages, previousSummary) => {
          return "summary text";
        },
      };
      expect(config.summarizeFn).toBeDefined();
      expect(typeof config.summarizeFn).toBe("function");
    });

    it("should accept minimum values for numeric fields", () => {
      const config: CompactionConfig = {
        contextLimit: 0,
        keepRecentTokens: 0,
        maxTokens: 0,
        reserveTokens: 0,
        thresholdRatio: 0,
      };
      expect(config.contextLimit).toBe(0);
      expect(config.keepRecentTokens).toBe(0);
      expect(config.maxTokens).toBe(0);
    });

    it("should accept ratio boundaries", () => {
      const config: CompactionConfig = {
        speculativeStartRatio: 0.15,
        thresholdRatio: 1,
      };
      expect(config.speculativeStartRatio).toBe(0.15);
      expect(config.thresholdRatio).toBe(1);
    });
  });

  // ============================================
  // 5. PruningConfig Interface
  // ============================================
  describe("PruningConfig", () => {
    it("should accept empty object with all optional fields", () => {
      const config: PruningConfig = {};
      expect(config.eagerPruneToolNames).toBeUndefined();
      expect(config.enabled).toBeUndefined();
    });

    it("should accept all optional fields", () => {
      const config: PruningConfig = {
        eagerPruneToolNames: ["tool1", "tool2"],
        enabled: true,
        minSavingsTokens: 200,
        protectedToolNames: ["protected1"],
        protectRecentTokens: 2000,
        replacementText: "[output pruned]",
      };
      expect(config.eagerPruneToolNames).toEqual(["tool1", "tool2"]);
      expect(config.enabled).toBe(true);
      expect(config.minSavingsTokens).toBe(200);
      expect(config.protectedToolNames).toEqual(["protected1"]);
      expect(config.protectRecentTokens).toBe(2000);
      expect(config.replacementText).toBe("[output pruned]");
    });

    it("should have correct default values (documented)", () => {
      const config: PruningConfig = {};
      // Documented defaults
      expect(config.eagerPruneToolNames).toBeUndefined(); // [] when set
      expect(config.enabled).toBeUndefined(); // false when set
      expect(config.minSavingsTokens).toBeUndefined(); // 200 when set
      expect(config.protectedToolNames).toBeUndefined(); // [] when set
      expect(config.protectRecentTokens).toBeUndefined(); // 2000 when set
      expect(config.replacementText).toBeUndefined(); // "[output pruned — too large]" when set
    });

    it("should accept empty arrays for tool names", () => {
      const config: PruningConfig = {
        eagerPruneToolNames: [],
        protectedToolNames: [],
      };
      expect(config.eagerPruneToolNames).toEqual([]);
      expect(config.protectedToolNames).toEqual([]);
    });

    it("should accept minimum values for numeric fields", () => {
      const config: PruningConfig = {
        minSavingsTokens: 0,
        protectRecentTokens: 0,
      };
      expect(config.minSavingsTokens).toBe(0);
      expect(config.protectRecentTokens).toBe(0);
    });
  });

  // ============================================
  // 6. ContinuationVariant Type
  // ============================================
  describe("ContinuationVariant", () => {
    it("should accept 'manual' variant", () => {
      const variant: ContinuationVariant = "manual";
      expect(variant).toBe("manual");
    });

    it("should accept 'auto-with-replay' variant", () => {
      const variant: ContinuationVariant = "auto-with-replay";
      expect(variant).toBe("auto-with-replay");
    });

    it("should accept 'tool-loop' variant", () => {
      const variant: ContinuationVariant = "tool-loop";
      expect(variant).toBe("tool-loop");
    });

    it("should be a union type of string literals", () => {
      const variants: ContinuationVariant[] = [
        "manual",
        "auto-with-replay",
        "tool-loop",
      ];
      expect(variants).toHaveLength(3);
    });
  });

  // ============================================
  // 7. CompactionResult Interface
  // ============================================
  describe("CompactionResult", () => {
    it("should have required success field", () => {
      const result: CompactionResult = {
        success: true,
        tokensAfter: 1000,
        tokensBefore: 5000,
      };
      expect(result.success).toBe(true);
      expect(result.tokensAfter).toBe(1000);
      expect(result.tokensBefore).toBe(5000);
    });

    it("should accept optional fields", () => {
      const result: CompactionResult = {
        success: false,
        reason: "Token limit exceeded",
        continuationVariant: "manual",
        summaryMessageId: "summary-123",
        tokensAfter: 1000,
        tokensBefore: 5000,
      };
      expect(result.reason).toBe("Token limit exceeded");
      expect(result.continuationVariant).toBe("manual");
      expect(result.summaryMessageId).toBe("summary-123");
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidResult: CompactionResult = {};
      expect(invalidResult.success).toBeUndefined();
    });

    it("should calculate token delta correctly", () => {
      const result: CompactionResult = {
        success: true,
        tokensAfter: 1000,
        tokensBefore: 5000,
      };
      expect(result.tokensBefore - result.tokensAfter).toBe(4000);
    });
  });

  // ============================================
  // 8. PreparedCompactionV2 Interface
  // ============================================
  describe("PreparedCompactionV2", () => {
    it("should have all required fields", () => {
      const compaction: PreparedCompactionV2 = {
        baseMessageIds: ["msg-1", "msg-2"],
        revision: 1,
        splitIndex: 5,
        summaryText: "summary",
        tokenDelta: 3000,
      };
      expect(compaction.baseMessageIds).toHaveLength(2);
      expect(compaction.revision).toBe(1);
      expect(compaction.splitIndex).toBe(5);
      expect(compaction.summaryText).toBe("summary");
      expect(compaction.tokenDelta).toBe(3000);
    });

    it("should accept optional replayMessage field", () => {
      const compaction: PreparedCompactionV2 = {
        baseMessageIds: ["msg-1"],
        revision: 1,
        splitIndex: 0,
        summaryText: "summary",
        tokenDelta: 1000,
        replayMessage: {
          createdAt: Date.now(),
          id: "replay-1",
          isSummary: true,
          message: { role: "user", content: "test" } as ModelMessage,
        },
      };
      expect(compaction.replayMessage).toBeDefined();
      expect(compaction.replayMessage?.id).toBe("replay-1");
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidCompaction: PreparedCompactionV2 = {};
      expect(invalidCompaction.baseMessageIds).toBeUndefined();
    });
  });

  // ============================================
  // 9. ActualTokenUsage Interface
  // ============================================
  describe("ActualTokenUsage", () => {
    it("should have all required fields", () => {
      const usage: ActualTokenUsage = {
        completionTokens: 100,
        promptTokens: 50,
        totalTokens: 150,
        updatedAt: new Date(),
      };
      expect(usage.completionTokens).toBe(100);
      expect(usage.promptTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
      expect(usage.updatedAt).toBeInstanceOf(Date);
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidUsage: ActualTokenUsage = {};
      expect(invalidUsage.completionTokens).toBeUndefined();
    });

    it("should have correct numeric types", () => {
      const usage: ActualTokenUsage = {
        completionTokens: 0,
        promptTokens: 0,
        totalTokens: 0,
        updatedAt: new Date(),
      };
      expect(typeof usage.completionTokens).toBe("number");
      expect(typeof usage.promptTokens).toBe("number");
      expect(typeof usage.totalTokens).toBe("number");
    });
  });

  // ============================================
  // 10. ActualTokenUsageInput Interface
  // ============================================
  describe("ActualTokenUsageInput", () => {
    it("should accept empty object", () => {
      const input: ActualTokenUsageInput = {};
      expect(input.completionTokens).toBeUndefined();
      expect(input.promptTokens).toBeUndefined();
    });

    it("should accept all optional fields", () => {
      const input: ActualTokenUsageInput = {
        completionTokens: 100,
        inputTokens: 50,
        outputTokens: 50,
        promptTokens: 50,
        totalTokens: 150,
        updatedAt: new Date(),
      };
      expect(input.completionTokens).toBe(100);
      expect(input.inputTokens).toBe(50);
      expect(input.outputTokens).toBe(50);
      expect(input.promptTokens).toBe(50);
      expect(input.totalTokens).toBe(150);
    });

    it("should accept alternative field names (inputTokens/outputTokens)", () => {
      const input: ActualTokenUsageInput = {
        inputTokens: 100,
        outputTokens: 50,
      };
      expect(input.inputTokens).toBe(100);
      expect(input.outputTokens).toBe(50);
    });

    it("should accept Date type for updatedAt", () => {
      const input: ActualTokenUsageInput = {
        updatedAt: new Date("2024-01-01"),
      };
      expect(input.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ============================================
  // 11. ContextUsage Interface
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
      expect(usage.limit).toBe(128000);
      expect(usage.percentage).toBe(50);
      expect(usage.remaining).toBe(64000);
      expect(usage.source).toBe("actual");
      expect(usage.used).toBe(64000);
    });

    it("should accept 'estimated' source", () => {
      const usage: ContextUsage = {
        limit: 128000,
        percentage: 75,
        remaining: 32000,
        source: "estimated",
        used: 96000,
      };
      expect(usage.source).toBe("estimated");
    });

    it("should accept percentage boundaries", () => {
      const usage: ContextUsage = {
        limit: 128000,
        percentage: 0,
        remaining: 128000,
        source: "actual",
        used: 0,
      };
      expect(usage.percentage).toBe(0);
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidUsage: ContextUsage = {};
      expect(invalidUsage.limit).toBeUndefined();
    });
  });

  // ============================================
  // 12. TodoItem Interface
  // ============================================
  describe("TodoItem", () => {
    it("should have all required fields", () => {
      const todo: TodoItem = {
        content: "Task description",
        status: "pending",
      };
      expect(todo.content).toBe("Task description");
      expect(todo.status).toBe("pending");
    });

    it("should accept all status values", () => {
      const statuses: TodoItem["status"][] = ["pending", "in_progress", "completed", "cancelled"];
      statuses.forEach((status) => {
        const todo: TodoItem = {
          content: "test",
          status,
        };
        expect(todo.status).toBe(status);
      });
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidTodo: TodoItem = {};
      expect(invalidTodo.content).toBeUndefined();
    });
  });

  // ============================================
  // 13. StructuredState Interface
  // ============================================
  describe("StructuredState", () => {
    it("should accept empty object", () => {
      const state: StructuredState = {};
      expect(state.metadata).toBeUndefined();
      expect(state.todos).toBeUndefined();
    });

    it("should accept optional metadata field", () => {
      const state: StructuredState = {
        metadata: { key: "value", count: 42 },
      };
      expect(state.metadata).toEqual({ key: "value", count: 42 });
    });

    it("should accept optional todos field", () => {
      const state: StructuredState = {
        todos: [
          { content: "task1", status: "pending" },
          { content: "task2", status: "completed" },
        ],
      };
      expect(state.todos).toHaveLength(2);
      expect(state.todos?.[0].status).toBe("pending");
    });

    it("should accept both metadata and todos", () => {
      const state: StructuredState = {
        metadata: { version: 1 },
        todos: [{ content: "test", status: "in_progress" }],
      };
      expect(state.metadata).toBeDefined();
      expect(state.todos).toBeDefined();
    });
  });

  // ============================================
  // 14. SessionHeaderLine Interface
  // ============================================
  describe("SessionHeaderLine", () => {
    it("should have all required fields", () => {
      const header: SessionHeaderLine = {
        createdAt: Date.now(),
        sessionId: "session-1",
        type: "header",
        version: 1,
      };
      expect(header.createdAt).toBeDefined();
      expect(header.sessionId).toBe("session-1");
      expect(header.type).toBe("header");
      expect(header.version).toBe(1);
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidHeader: SessionHeaderLine = {};
      expect(invalidHeader.type).toBeUndefined();
    });

    it("should have correct type literal", () => {
      const header: SessionHeaderLine = {
        createdAt: Date.now(),
        sessionId: "test",
        type: "header",
        version: 1,
      };
      expect(header.type).toBe("header");
    });
  });

  // ============================================
  // 15. MessageLine Interface
  // ============================================
  describe("MessageLine", () => {
    it("should have all required fields", () => {
      const line: MessageLine = {
        createdAt: Date.now(),
        id: "msg-1",
        isSummary: false,
        message: { role: "user", content: "test" } as ModelMessage,
        type: "message",
      };
      expect(line.createdAt).toBeDefined();
      expect(line.id).toBe("msg-1");
      expect(line.isSummary).toBe(false);
      expect(line.type).toBe("message");
    });

    it("should accept optional originalContent field", () => {
      const line: MessageLine = {
        createdAt: Date.now(),
        id: "msg-1",
        isSummary: false,
        message: { role: "user", content: "test" } as ModelMessage,
        originalContent: "original",
        type: "message",
      };
      expect(line.originalContent).toBe("original");
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidLine: MessageLine = {};
      expect(invalidLine.type).toBeUndefined();
    });
  });

  // ============================================
  // 16. CheckpointLine Interface
  // ============================================
  describe("CheckpointLine", () => {
    it("should have all required fields", () => {
      const line: CheckpointLine = {
        summaryMessageId: "summary-1",
        type: "checkpoint",
        updatedAt: Date.now(),
      };
      expect(line.summaryMessageId).toBe("summary-1");
      expect(line.type).toBe("checkpoint");
      expect(line.updatedAt).toBeDefined();
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidLine: CheckpointLine = {};
      expect(invalidLine.type).toBeUndefined();
    });
  });

  // ============================================
  // 17. SessionFileLine Type (Union)
  // ============================================
  describe("SessionFileLine", () => {
    it("should accept SessionHeaderLine", () => {
      const line: SessionFileLine = {
        createdAt: Date.now(),
        sessionId: "session-1",
        type: "header",
        version: 1,
      };
      expect(line.type).toBe("header");
    });

    it("should accept MessageLine", () => {
      const line: SessionFileLine = {
        createdAt: Date.now(),
        id: "msg-1",
        isSummary: false,
        message: { role: "user", content: "test" } as ModelMessage,
        type: "message",
      };
      expect(line.type).toBe("message");
    });

    it("should accept CheckpointLine", () => {
      const line: SessionFileLine = {
        summaryMessageId: "summary-1",
        type: "checkpoint",
        updatedAt: Date.now(),
      };
      expect(line.type).toBe("checkpoint");
    });

    it("should be a union type", () => {
      const lines: SessionFileLine[] = [
        { createdAt: Date.now(), sessionId: "s1", type: "header", version: 1 },
        { createdAt: Date.now(), id: "m1", isSummary: false, message: {} as ModelMessage, type: "message" },
        { summaryMessageId: "s1", type: "checkpoint", updatedAt: Date.now() },
      ];
      expect(lines).toHaveLength(3);
    });
  });

  // ============================================
  // 18. CompactionSummary Interface
  // ============================================
  describe("CompactionSummary", () => {
    it("should have all required fields", () => {
      const summary: CompactionSummary = {
        createdAt: new Date(),
        firstKeptMessageId: "msg-5",
        id: "summary-1",
        summary: "compacted summary text",
        summaryTokens: 500,
        tokensBefore: 5000,
      };
      expect(summary.createdAt).toBeInstanceOf(Date);
      expect(summary.firstKeptMessageId).toBe("msg-5");
      expect(summary.id).toBe("summary-1");
      expect(summary.summary).toBe("compacted summary text");
      expect(summary.summaryTokens).toBe(500);
      expect(summary.tokensBefore).toBe(5000);
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidSummary: CompactionSummary = {};
      expect(invalidSummary.id).toBeUndefined();
    });
  });

  // ============================================
  // 19. CompactionSegment Interface
  // ============================================
  describe("CompactionSegment", () => {
    it("should have all required fields", () => {
      const segment: CompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-10",
        estimatedTokens: 3000,
        id: "segment-1",
        messageCount: 5,
        messageIds: ["msg-1", "msg-2", "msg-3", "msg-4", "msg-5"],
        messages: [],
        startMessageId: "msg-1",
        summary: null,
      };
      expect(segment.createdAt).toBeInstanceOf(Date);
      expect(segment.endMessageId).toBe("msg-10");
      expect(segment.estimatedTokens).toBe(3000);
      expect(segment.messageCount).toBe(5);
      expect(segment.messageIds).toHaveLength(5);
      expect(segment.summary).toBeNull();
    });

    it("should accept CompactionSummary for summary field", () => {
      const summary: CompactionSummary = {
        createdAt: new Date(),
        firstKeptMessageId: "msg-5",
        id: "summary-1",
        summary: "summary",
        summaryTokens: 100,
        tokensBefore: 1000,
      };
      const segment: CompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-10",
        estimatedTokens: 3000,
        id: "segment-1",
        messageCount: 5,
        messageIds: [],
        messages: [],
        startMessageId: "msg-1",
        summary,
      };
      expect(segment.summary).toBeDefined();
      expect(segment.summary?.id).toBe("summary-1");
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidSegment: CompactionSegment = {};
      expect(invalidSegment.id).toBeUndefined();
    });
  });

  // ============================================
  // 20. PreparedCompactionSegment Interface
  // ============================================
  describe("PreparedCompactionSegment", () => {
    it("should have all required fields", () => {
      const segment: PreparedCompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-10",
        estimatedTokens: 3000,
        id: "segment-1",
        messageCount: 5,
        messageIds: ["msg-1", "msg-2"],
        messages: [],
        startMessageId: "msg-1",
        summary: null,
      };
      expect(segment.createdAt).toBeInstanceOf(Date);
      expect(segment.endMessageId).toBe("msg-10");
      expect(segment.estimatedTokens).toBe(3000);
      expect(segment.summary).toBeNull();
    });

    it("should accept CompactionSummary for summary field", () => {
      const summary: CompactionSummary = {
        createdAt: new Date(),
        firstKeptMessageId: "msg-5",
        id: "summary-1",
        summary: "summary",
        summaryTokens: 100,
        tokensBefore: 1000,
      };
      const segment: PreparedCompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-10",
        estimatedTokens: 3000,
        id: "segment-1",
        messageCount: 5,
        messageIds: [],
        messages: [],
        startMessageId: "msg-1",
        summary,
      };
      expect(segment.summary).toBeDefined();
    });
  });

  // ============================================
  // 21. PreparedCompaction Interface
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
        phase: "intermediate-step",
        rejected: false,
        segments: [],
        tokenDelta: 3000,
      };
      expect(compaction.actualUsage).toBeNull();
      expect(compaction.baseMessageIds).toHaveLength(2);
      expect(compaction.baseRevision).toBe(1);
      expect(compaction.didChange).toBe(false);
      expect(compaction.pendingCompaction).toBe(false);
      expect(compaction.phase).toBe("intermediate-step");
      expect(compaction.rejected).toBe(false);
    });

    it("should accept ActualTokenUsage for actualUsage", () => {
      const usage: ActualTokenUsage = {
        completionTokens: 100,
        promptTokens: 50,
        totalTokens: 150,
        updatedAt: new Date(),
      };
      const compaction: PreparedCompaction = {
        actualUsage: usage,
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
      expect(compaction.actualUsage).toBeDefined();
      expect(compaction.actualUsage?.totalTokens).toBe(150);
    });

    it("should accept both phase values", () => {
      const phases: PreparedCompaction["phase"][] = ["intermediate-step", "new-turn"];
      phases.forEach((phase) => {
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
          phase,
          rejected: false,
          segments: [],
          tokenDelta: 0,
        };
        expect(compaction.phase).toBe(phase);
      });
    });

    it("should accept PreparedCompactionSegment array", () => {
      const segment: PreparedCompactionSegment = {
        createdAt: new Date(),
        endMessageId: "msg-10",
        estimatedTokens: 3000,
        id: "segment-1",
        messageCount: 5,
        messageIds: [],
        messages: [],
        startMessageId: "msg-1",
        summary: null,
      };
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
        segments: [segment],
        tokenDelta: 0,
      };
      expect(compaction.segments).toHaveLength(1);
    });

    it("should reject when required fields are missing", () => {
      // @ts-expect-error - missing required fields
      const invalidCompaction: PreparedCompaction = {};
      expect(invalidCompaction.actualUsage).toBeUndefined();
    });
  });

  // ============================================
  // Type Compatibility Tests
  // ============================================
  describe("Type Compatibility", () => {
    it("CheckpointMessage should be compatible with Message structure", () => {
      const checkpoint: CheckpointMessage = {
        createdAt: Date.now(),
        id: "checkpoint-1",
        isSummary: false,
        message: { role: "user", content: "test" } as ModelMessage,
      };
      // CheckpointMessage has required fields that overlap with Message
      expect(typeof checkpoint.createdAt).toBe("number");
      expect(typeof checkpoint.id).toBe("string");
    });

    it("ActualTokenUsageInput should be compatible with partial ActualTokenUsage", () => {
      const input: ActualTokenUsageInput = {
        completionTokens: 100,
        promptTokens: 50,
      };
      // This shows that ActualTokenUsageInput can provide values for ActualTokenUsage
      const usage: ActualTokenUsage = {
        completionTokens: input.completionTokens ?? 0,
        promptTokens: input.promptTokens ?? 0,
        totalTokens: (input.completionTokens ?? 0) + (input.promptTokens ?? 0),
        updatedAt: new Date(),
      };
      expect(usage.completionTokens).toBe(100);
      expect(usage.promptTokens).toBe(50);
    });

    it("SessionFileLine union should discriminate by type field", () => {
      const checkLineType = (line: SessionFileLine) => {
        if (line.type === "header") {
          return (line as SessionHeaderLine).version;
        }
        if (line.type === "message") {
          return (line as MessageLine).id;
        }
        if (line.type === "checkpoint") {
          return (line as CheckpointLine).summaryMessageId;
        }
        return null;
      };

      const header: SessionFileLine = { createdAt: 1, sessionId: "s1", type: "header", version: 1 };
      const message: SessionFileLine = { createdAt: 1, id: "m1", isSummary: false, message: {} as ModelMessage, type: "message" };
      const checkpoint: SessionFileLine = { summaryMessageId: "c1", type: "checkpoint", updatedAt: 1 };

      expect(checkLineType(header)).toBe(1);
      expect(checkLineType(message)).toBe("m1");
      expect(checkLineType(checkpoint)).toBe("c1");
    });

    it("CompactionSegment and PreparedCompactionSegment should have compatible structures", () => {
      const segment: CompactionSegment = {
        createdAt: new Date(),
        endMessageId: "end-1",
        estimatedTokens: 1000,
        id: "seg-1",
        messageCount: 3,
        messageIds: ["m1", "m2", "m3"],
        messages: [],
        startMessageId: "start-1",
        summary: null,
      };

      const preparedSegment: PreparedCompactionSegment = {
        createdAt: segment.createdAt,
        endMessageId: segment.endMessageId,
        estimatedTokens: segment.estimatedTokens,
        id: segment.id,
        messageCount: segment.messageCount,
        messageIds: segment.messageIds,
        messages: segment.messages,
        startMessageId: segment.startMessageId,
        summary: segment.summary,
      };

      expect(preparedSegment.id).toBe(segment.id);
      expect(preparedSegment.estimatedTokens).toBe(segment.estimatedTokens);
    });
  });
});
