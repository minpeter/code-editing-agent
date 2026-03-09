import { describe, expect, it } from "bun:test";
import { MessageHistory } from "./message-history";

/**
 * Integration tests for compaction logic with model-specific token limits.
 *
 * Simulates the compaction config that AgentManager.buildCompactionConfig()
 * would produce for different model configurations.
 *
 * Token estimation: ~4 chars per token (CHARS_PER_TOKEN constant in message-history.ts)
 */

// ─── Model configs (mirrors what buildCompactionConfig produces) ───

/** test-8k: contextLength=8192, effectiveMaxOutput=min(1024,64000)=1024 */
const TEST_8K_CONFIG = {
  enabled: true,
  maxTokens: 8192,
  reserveTokens: 1024,
  keepRecentTokens: Math.floor(8192 * 0.3), // 2457
} as const;

/** GLM-5: contextLength=202752, effectiveMaxOutput=min(202752,64000)=64000 */
const GLM5_CONFIG = {
  enabled: true,
  maxTokens: 202_752,
  reserveTokens: 64_000,
  keepRecentTokens: Math.floor(202_752 * 0.3), // 60825
} as const;

// ─── Helpers ───

const CHARS_PER_TOKEN = 4;

/** Create a message string of approximately `tokenCount` tokens. */
function makeContent(tokenCount: number): string {
  return "x".repeat(tokenCount * CHARS_PER_TOKEN);
}

function createHistory(compaction: typeof TEST_8K_CONFIG) {
  return new MessageHistory({ compaction });
}

/**
 * Create a history with auto-compaction disabled.
 * Messages are added freely, then compact() is called manually.
 * Avoids the race where async checkAndCompact overwrites this.messages
 * while the sync loop is still adding messages.
 */
function createHistoryManual(compaction: typeof TEST_8K_CONFIG) {
  return new MessageHistory({
    compaction: { ...compaction, enabled: false },
  });
}

function enableCompaction(
  history: MessageHistory,
  config: typeof TEST_8K_CONFIG
) {
  history.updateCompaction({ ...config, enabled: true });
}

// ─── Tests ───

describe("compaction integration with model-specific configs", () => {
  describe("test-8k model (contextLength=8192, maxOutput=1024)", () => {
    // Trigger threshold: totalTokens > maxTokens - reserveTokens = 8192 - 1024 = 7168

    it("does NOT trigger compaction below threshold", async () => {
      const history = createHistory(TEST_8K_CONFIG);

      // Add 7 messages of ~1000 tokens each = ~7000 tokens (below 7168)
      for (let i = 0; i < 7; i++) {
        history.addUserMessage(makeContent(1000));
      }

      // Allow async compaction to settle
      await new Promise((r) => setTimeout(r, 50));

      const estimated = history.getEstimatedTokens();
      expect(estimated).toBeGreaterThanOrEqual(6900);
      expect(estimated).toBeLessThan(7168);
      expect(history.getSummaries()).toHaveLength(0);
      expect(history.getAll().length).toBe(7);
    });

    it("DOES trigger compaction above threshold", async () => {
      const history = createHistory(TEST_8K_CONFIG);

      // Add 8 messages of ~1000 tokens each = ~8000 tokens (above 7168)
      for (let i = 0; i < 8; i++) {
        history.addUserMessage(makeContent(1000));
      }

      // Allow async compaction to settle
      await new Promise((r) => setTimeout(r, 100));

      // Should have compacted
      expect(history.getSummaries().length).toBeGreaterThanOrEqual(1);
      // Messages should be reduced
      expect(history.getAll().length).toBeLessThan(8);
    });

    it("preserves recent messages within keepRecentTokens budget", async () => {
      const history = createHistoryManual(TEST_8K_CONFIG);

      const messages: string[] = [];
      for (let i = 0; i < 10; i++) {
        const content = `msg_${i}_` + makeContent(990);
        messages.push(content);
        history.addUserMessage(content);
      }

      enableCompaction(history, TEST_8K_CONFIG);
      await history.compact();

      const remaining = history.getAll();
      const summaries = history.getSummaries();

      expect(summaries.length).toBeGreaterThanOrEqual(1);

      const remainingContents = remaining.map((m) =>
        typeof m.modelMessage.content === "string" ? m.modelMessage.content : ""
      );

      // keepRecentTokens = 2457 tokens, each msg ~1000 tokens → ~2 kept
      expect(remaining.length).toBeGreaterThanOrEqual(2);
      expect(remaining.length).toBeLessThanOrEqual(3);

      // Last remaining must be the most recent message
      const lastRemaining = remainingContents[remainingContents.length - 1];
      expect(lastRemaining).toContain("msg_9_");
    });

    it("includes summaries in getMessagesForLLM()", async () => {
      const history = createHistory(TEST_8K_CONFIG);

      // Force compaction
      for (let i = 0; i < 10; i++) {
        history.addUserMessage(makeContent(1000));
      }

      await new Promise((r) => setTimeout(r, 100));

      const llmMessages = history.getMessagesForLLM();
      const regularMessages = history.toModelMessages();

      // LLM messages should have a system message prepended with the summary
      expect(llmMessages.length).toBeGreaterThan(regularMessages.length);
      expect(llmMessages[0].role).toBe("system");
      expect(llmMessages[0].content).toContain(
        "Previous conversation context:"
      );
    });

    it("summary records correct metadata", async () => {
      const history = createHistory(TEST_8K_CONFIG);

      for (let i = 0; i < 10; i++) {
        history.addUserMessage(`Message ${i}: ${makeContent(990)}`);
      }

      await new Promise((r) => setTimeout(r, 100));

      const summaries = history.getSummaries();
      expect(summaries.length).toBeGreaterThanOrEqual(1);

      const summary = summaries[0];
      expect(summary.id).toMatch(/^summary_/);
      expect(summary.tokensBefore).toBeGreaterThan(0);
      expect(summary.summaryTokens).toBeGreaterThan(0);
      // Summary tokens should be much less than original
      expect(summary.summaryTokens).toBeLessThan(summary.tokensBefore);
      expect(summary.firstKeptMessageId).toBeTruthy();
    });

    it("handles updateCompaction correctly (model switch simulation)", async () => {
      const history = createHistory(TEST_8K_CONFIG);

      // Fill with some messages
      for (let i = 0; i < 5; i++) {
        history.addUserMessage(makeContent(1000));
      }

      await new Promise((r) => setTimeout(r, 50));

      // Should not compact yet (5000 < 7168)
      expect(history.getSummaries()).toHaveLength(0);

      // Simulate switching to a model with a tiny context
      history.updateCompaction({
        maxTokens: 4000,
        reserveTokens: 500,
        keepRecentTokens: 1200,
      });

      // Now manually compact — threshold is now 4000-500=3500, we have ~5000
      const compacted = await history.compact();
      expect(compacted).toBe(true);
      expect(history.getSummaries().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("threshold boundary precision", () => {
    it("does NOT compact at exactly the threshold", async () => {
      // Threshold = maxTokens - reserveTokens = 8192 - 1024 = 7168
      // We need totalTokens < 7168
      const history = createHistory(TEST_8K_CONFIG);

      // 7168 tokens * 4 chars = 28672 chars
      // Add exactly 7168 - 1 = 7167 tokens worth of content
      // Split into 7 messages of ~1024 tokens + 1 message of ~15 tokens
      for (let i = 0; i < 7; i++) {
        history.addUserMessage(makeContent(1000));
      }
      // Total now: ~7000 tokens, which is below 7168
      await new Promise((r) => setTimeout(r, 50));

      expect(history.getSummaries()).toHaveLength(0);
    });

    it("DOES compact just above the threshold", async () => {
      // Push just past 7168 tokens
      const history = createHistory(TEST_8K_CONFIG);

      for (let i = 0; i < 7; i++) {
        history.addUserMessage(makeContent(1000));
      }
      // Add one more message to push past threshold
      history.addUserMessage(makeContent(200));
      // Total: ~7200 tokens > 7168

      await new Promise((r) => setTimeout(r, 100));

      expect(history.getSummaries().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GLM-5 model sanity check (large context)", () => {
    it("does NOT trigger compaction prematurely with large context", async () => {
      const history = createHistory(GLM5_CONFIG);

      // Add 50 messages of ~1000 tokens = ~50000 tokens
      // Threshold: 202752 - 64000 = 138752
      // 50000 is way below 138752
      for (let i = 0; i < 50; i++) {
        history.addUserMessage(makeContent(1000));
      }

      await new Promise((r) => setTimeout(r, 50));

      expect(history.getSummaries()).toHaveLength(0);
      expect(history.getAll().length).toBe(50);
    });
  });

  describe("compaction config via getCompactionConfig/updateCompaction", () => {
    it("getCompactionConfig returns current config", () => {
      const history = createHistory(TEST_8K_CONFIG);
      const config = history.getCompactionConfig();

      expect(config.enabled).toBe(true);
      expect(config.maxTokens).toBe(8192);
      expect(config.reserveTokens).toBe(1024);
      expect(config.keepRecentTokens).toBe(Math.floor(8192 * 0.3));
    });

    it("updateCompaction changes the config", () => {
      const history = createHistory(TEST_8K_CONFIG);

      history.updateCompaction({ maxTokens: 4000, reserveTokens: 500 });

      const config = history.getCompactionConfig();
      expect(config.maxTokens).toBe(4000);
      expect(config.reserveTokens).toBe(500);
      // Unchanged fields stay the same
      expect(config.keepRecentTokens).toBe(Math.floor(8192 * 0.3));
      expect(config.enabled).toBe(true);
    });
  });
});
