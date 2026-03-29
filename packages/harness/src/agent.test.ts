import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "./agent";
import type { AgentConfig } from "./types";

const { streamTextMock } = vi.hoisted(() => {
  const mock = vi.fn(() => {
    const fullStream: AsyncIterable<{ finishReason: string; type: string }> = {
      [Symbol.asyncIterator]() {
        let done = false;
        return {
          next: () => {
            if (done) {
              return Promise.resolve({ done: true, value: undefined });
            }
            done = true;
            return Promise.resolve({
              done: false,
              value: { type: "finish-step", finishReason: "stop" },
            });
          },
        };
      },
    };
    return {
      finishReason: Promise.resolve("stop"),
      fullStream,
      response: Promise.resolve({ messages: [] }),
      totalUsage: Promise.resolve(undefined),
      usage: Promise.resolve(undefined),
    };
  });

  return { streamTextMock: mock };
});

vi.mock("ai", () => {
  return {
    stepCountIs: vi.fn(() => undefined),
    streamText: streamTextMock,
  };
});

function createMockModel(): AgentConfig["model"] {
  return {} as AgentConfig["model"];
}

describe("createAgent", () => {
  beforeEach(() => {
    streamTextMock.mockClear();
  });

  it("returns an agent with config and stream method", () => {
    const model = createMockModel();
    const agent = createAgent({ model });

    expect(agent).toHaveProperty("config");
    expect(agent).toHaveProperty("stream");
    expect(typeof agent.stream).toBe("function");
  });

  it("preserves provided config values", () => {
    const model = createMockModel();
    const config: AgentConfig = {
      model,
      instructions: "You are a harness test agent.",
      maxStepsPerTurn: 5,
    };

    const agent = createAgent(config);

    expect(agent.config.model).toBe(model);
    expect(agent.config.instructions).toBe("You are a harness test agent.");
    expect(agent.config.maxStepsPerTurn).toBe(5);
  });

  it("keeps maxStepsPerTurn undefined when omitted", () => {
    const agent = createAgent({ model: createMockModel() });

    expect(agent.config.maxStepsPerTurn).toBeUndefined();
  });

  it("passes temperature and seed through to streamText", () => {
    const agent = createAgent({ model: createMockModel() });

    agent.stream({
      messages: [],
      seed: 42,
      temperature: 0,
    });

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: 42,
        temperature: 0,
      })
    );
  });
});
