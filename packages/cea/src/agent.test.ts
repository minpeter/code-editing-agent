import {
  CheckpointHistory,
  type createModelSummarizer,
} from "@ai-sdk-tool/harness";
import { beforeEach, describe, expect, it } from "vitest";
import {
  agentManager,
  computeCompactionMaxTokens,
  computeSpeculativeStartRatio,
  selectTranslationReasoningMode,
} from "./agent";

describe("AgentManager translation state", () => {
  beforeEach(() => {
    agentManager.resetForTesting();
  });
  it("enables translation by default", () => {
    expect(agentManager.isTranslationEnabled()).toBe(true);
  });

  it("toggles translation state on and off", () => {
    agentManager.setTranslationEnabled(false);
    expect(agentManager.isTranslationEnabled()).toBe(false);

    agentManager.setTranslationEnabled(true);
    expect(agentManager.isTranslationEnabled()).toBe(true);
  });
});

describe("selectTranslationReasoningMode", () => {
  it("prefers off when available", () => {
    expect(selectTranslationReasoningMode(["preserved", "off", "on"])).toBe(
      "off"
    );
  });

  it("falls back to on when off is unavailable", () => {
    expect(selectTranslationReasoningMode(["interleaved", "on"])).toBe("on");
  });
});

describe("AgentManager translation reasoning selection", () => {
  beforeEach(() => {
    agentManager.resetForTesting();
  });

  it("uses off for translation when off is selectable", () => {
    agentManager.setProvider("friendli");
    agentManager.setModelId("zai-org/GLM-5");
    agentManager.setReasoningMode("preserved");

    expect(agentManager.getTranslationReasoningMode()).toBe("off");
  });

  it("uses on for translation when off is unavailable", () => {
    agentManager.setProvider("friendli");
    agentManager.setModelId("MiniMaxAI/MiniMax-M2.5");
    agentManager.setReasoningMode("interleaved");

    expect(agentManager.getTranslationReasoningMode()).toBe("on");
  });
});

describe("AgentManager compaction config", () => {
  beforeEach(() => {
    agentManager.resetForTesting();
  });

  it("uses a soft compaction threshold and earlier speculative ratio based on usable input budget", () => {
    agentManager.setProvider("friendli");
    agentManager.setModelId("test-compact");

    const mutableAgentManager = agentManager as unknown as {
      getProviderModel(
        modelId: string,
        provider: string
      ): Parameters<typeof createModelSummarizer>[0];
    };
    mutableAgentManager.getProviderModel = () => ({}) as never;

    const compaction = agentManager.buildCompactionConfig();
    const contextLength = agentManager.getModelTokenLimits().contextLength;
    const history = new CheckpointHistory({ compaction });
    history.setContextLimit(contextLength);
    history.addUserMessage("hello");

    const expectedRatio = computeSpeculativeStartRatio(
      contextLength,
      compaction.reserveTokens ?? 0
    );
    const expectedMaxTokens = computeCompactionMaxTokens(
      contextLength,
      compaction.reserveTokens ?? 0
    );

    expect(compaction.maxTokens).toBe(expectedMaxTokens);
    expect(agentManager.getModelTokenLimits().maxCompletionTokens).toBe(20_480);
    expect(compaction.reserveTokens).toBe(2048);
    expect(compaction.keepRecentTokens).toBe(
      Math.min(
        Math.floor(contextLength * 0.3),
        Math.max(512, Math.floor(expectedMaxTokens * 0.5))
      )
    );
    expect(compaction.speculativeStartRatio).toBe(expectedRatio);
    expect(expectedRatio).toBeCloseTo(0.75, 2);

    history.updateActualUsage({
      totalTokens: 16_000,
      promptTokens: 16_000,
      completionTokens: 0,
      updatedAt: new Date(),
    });
    expect(history.shouldStartSpeculativeCompactionForNextTurn()).toBe(true);
    expect(history.needsCompaction()).toBe(true);
  });

  it("fails fast with a clear error when stream is called with empty messages", async () => {
    await expect(agentManager.stream([])).rejects.toThrow(
      "Cannot call the model with an empty message list after context preparation."
    );
  });
});
