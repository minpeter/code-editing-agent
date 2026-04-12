import { describe, expect, it } from "vitest";
import { AgentError, AgentErrorCode } from "./errors";

describe("AgentErrorCode", () => {
  it("has all expected codes", () => {
    const expected = [
      "CONTEXT_OVERFLOW",
      "NO_OUTPUT",
      "TOOL_FAILURE",
      "TIMEOUT",
      "MAX_ITERATIONS",
      "MAX_TOOL_CALLS",
      "REPEATED_TOOL_CALL",
    ];
    for (const code of expected) {
      expect(AgentErrorCode[code as keyof typeof AgentErrorCode]).toBe(code);
    }
  });
});

describe("AgentError", () => {
  it("extends Error", () => {
    const err = new AgentError(AgentErrorCode.TIMEOUT, "timed out");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgentError);
  });

  it("stores code and message", () => {
    const err = new AgentError(AgentErrorCode.MAX_TOOL_CALLS, "too many");
    expect(err.code).toBe(AgentErrorCode.MAX_TOOL_CALLS);
    expect(err.message).toBe("too many");
    expect(err.name).toBe("AgentError");
  });

  it("supports cause chain", () => {
    const cause = new Error("root");
    const err = new AgentError(AgentErrorCode.TOOL_FAILURE, "failed", cause);
    expect(err.cause).toBe(cause);
  });
});
