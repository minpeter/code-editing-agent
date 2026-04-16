import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentManager } from "./agent";

describe("AgentManager reasoning mode defaults", () => {
  let originalModelId: ReturnType<typeof agentManager.getModelId>;
  let originalReasoningMode: ReturnType<typeof agentManager.getReasoningMode>;

  beforeEach(() => {
    originalModelId = agentManager.getModelId();
    originalReasoningMode = agentManager.getReasoningMode();
  });

  afterEach(() => {
    agentManager.setModelId(originalModelId);
    agentManager.setReasoningMode(originalReasoningMode);
  });

  it("selects on as default for configured AI models", () => {
    agentManager.resetForTesting();

    expect(agentManager.getReasoningMode()).toBe("on");
  });

  it("still allows explicit override after default selection", () => {
    agentManager.resetForTesting();
    agentManager.setReasoningMode("off");

    expect(agentManager.getReasoningMode()).toBe("off");
  });
});
