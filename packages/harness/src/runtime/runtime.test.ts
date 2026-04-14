import { describe, expect, it, vi, beforeEach } from "vitest";
import { defineAgent, isDefinedAgent, createAgentRuntime } from "./index";
import { InMemorySnapshotStore } from "../snapshot-store";

function* emptyStream() {
  yield* [];
}

vi.mock("../agent", () => ({
  createAgent: vi.fn().mockImplementation(async (config) => ({
    config,
    close: vi.fn().mockResolvedValue(undefined),
    stream: vi.fn().mockReturnValue({
      finishReason: Promise.resolve("stop"),
      fullStream: emptyStream(),
      response: Promise.resolve({ messages: [] }),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    }),
  })),
}));

const mockModel = {} as import("ai").LanguageModel;

describe("defineAgent", () => {
  it("returns object with kind: defined-agent and correct name", () => {
    const def = defineAgent({
      name: "test",
      agent: { model: mockModel, instructions: "hi" },
    });
    expect(def.kind).toBe("defined-agent");
    expect(def.name).toBe("test");
  });

  it("throws when name is empty", () => {
    expect(() =>
      defineAgent({ name: "", agent: { model: mockModel, instructions: "hi" } })
    ).toThrow();
  });

  it("throws when name is whitespace only", () => {
    expect(() =>
      defineAgent({
        name: "   ",
        agent: { model: mockModel, instructions: "hi" },
      })
    ).toThrow();
  });

  it("preserves optional fields like version and description", () => {
    const def = defineAgent({
      name: "my-agent",
      version: "1.2.3",
      description: "A test agent",
      agent: { model: mockModel, instructions: "hello" },
    });
    expect(def.version).toBe("1.2.3");
    expect(def.description).toBe("A test agent");
  });
});

describe("isDefinedAgent", () => {
  it("returns true for a valid DefinedAgent", () => {
    const def = defineAgent({
      name: "test",
      agent: { model: mockModel, instructions: "hi" },
    });
    expect(isDefinedAgent(def)).toBe(true);
  });

  it("returns false for objects with wrong kind", () => {
    expect(isDefinedAgent({ kind: "other", name: "x" })).toBe(false);
  });

  it("returns false for null and non-objects", () => {
    expect(isDefinedAgent(null)).toBe(false);
    expect(isDefinedAgent(undefined)).toBe(false);
    expect(isDefinedAgent("string")).toBe(false);
    expect(isDefinedAgent(42)).toBe(false);
  });
});

describe("createAgentRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("openSession creates session with correct agentName and non-empty sessionId", async () => {
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "test",
      agents: [def] as const,
    });
    const session = await runtime.openSession();
    expect(session.agentName).toBe("bot");
    expect(typeof session.sessionId).toBe("string");
    expect(session.sessionId.length).toBeGreaterThan(0);
  });

  it("getAgentNames returns all registered agent names in order", async () => {
    const a = defineAgent({
      name: "a",
      agent: { model: mockModel, instructions: "a" },
    });
    const b = defineAgent({
      name: "b",
      agent: { model: mockModel, instructions: "b" },
    });
    const runtime = await createAgentRuntime({
      name: "test",
      agents: [a, b] as const,
    });
    expect(runtime.getAgentNames()).toEqual(["a", "b"]);
  });

  it("throws on duplicate agent names", async () => {
    const a1 = defineAgent({
      name: "dup",
      agent: { model: mockModel, instructions: "first" },
    });
    const a2 = defineAgent({
      name: "dup",
      agent: { model: mockModel, instructions: "second" },
    });
    await expect(
      createAgentRuntime({ name: "test", agents: [a1, a2] as const })
    ).rejects.toThrow("duplicate");
  });

  it("resumeSession restores history from snapshotStore", async () => {
    const store = new InMemorySnapshotStore();
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "test",
      agents: [def] as const,
      persistence: { snapshotStore: store },
    });

    const session1 = await runtime.openSession();
    session1.addUserMessage("hello");
    await session1.save();

    const session2 = await runtime.resumeSession({
      sessionId: session1.sessionId,
    });
    expect(session2.getMessagesForLLM().length).toBeGreaterThan(0);
  });

  it("runtime.close() resolves without error", async () => {
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "t",
      agents: [def] as const,
    });
    await expect(runtime.close()).resolves.toBeUndefined();
  });
});

describe("AgentSession methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("session.save persists snapshot to store", async () => {
    const store = new InMemorySnapshotStore();
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "t",
      agents: [def] as const,
      persistence: { snapshotStore: store },
    });
    const session = await runtime.openSession();
    session.addUserMessage("test");
    await session.save();
    const snap = await store.load(session.sessionId);
    expect(snap).not.toBeNull();
  });

  it("session.reload restores from stored snapshot", async () => {
    const store = new InMemorySnapshotStore();
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "t",
      agents: [def] as const,
      persistence: { snapshotStore: store },
    });
    const session = await runtime.openSession();
    session.addUserMessage("hello");
    await session.save();

    // Resume a fresh session (history is re-loaded from store on buildSession)
    const session2 = await runtime.resumeSession({
      sessionId: session.sessionId,
    });
    await session2.reload();
    expect(session2.getMessagesForLLM().length).toBeGreaterThan(0);
  });

  it("session.reset clears history and assigns a new sessionId", async () => {
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "t",
      agents: [def] as const,
    });
    const session = await runtime.openSession();
    const originalId = session.sessionId;
    session.addUserMessage("message before reset");
    await session.reset();
    expect(session.sessionId).not.toBe(originalId);
    expect(session.getMessagesForLLM().length).toBe(0);
  });

  it("session.fork creates independent copy with different sessionId", async () => {
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "t",
      agents: [def] as const,
    });
    const session = await runtime.openSession();
    session.addUserMessage("original message");

    const forked = await session.fork();
    expect(forked.sessionId).not.toBe(session.sessionId);
    expect(forked.getMessagesForLLM().length).toBe(
      session.getMessagesForLLM().length
    );

    // Mutations to fork don't affect original
    forked.addUserMessage("new message in fork");
    expect(forked.getMessagesForLLM().length).toBeGreaterThan(
      session.getMessagesForLLM().length
    );
  });

  it("session.addUserMessage makes message visible in getMessagesForLLM", async () => {
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "t",
      agents: [def] as const,
    });
    const session = await runtime.openSession();
    expect(session.getMessagesForLLM().length).toBe(0);
    session.addUserMessage("first message");
    expect(session.getMessagesForLLM().length).toBe(1);
    expect(session.getMessagesForLLM()[0]?.role).toBe("user");
  });

  it("session.runTurn returns result with finishReason, iterations, and messages array", async () => {
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "t",
      agents: [def] as const,
    });
    const session = await runtime.openSession();
    const result = await session.runTurn({ input: "hello", maxIterations: 1 });
    expect(result.finishReason).toBeDefined();
    expect(typeof result.iterations).toBe("number");
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("session.state.status is idle after runTurn completes", async () => {
    const def = defineAgent({
      name: "bot",
      agent: { model: mockModel, instructions: "hi" },
    });
    const runtime = await createAgentRuntime({
      name: "t",
      agents: [def] as const,
    });
    const session = await runtime.openSession();
    await session.runTurn({ input: "hello", maxIterations: 1 });
    expect(session.state.status).toBe("idle");
  });
});
