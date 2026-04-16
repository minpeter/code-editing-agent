import type { AgentSession } from "@ai-sdk-tool/harness/runtime";

import { runHeadless } from "./runner";
import type { HeadlessRunnerConfig } from "./types";

export type SessionHeadlessOptions = Omit<
  HeadlessRunnerConfig,
  "agent" | "messageHistory" | "sessionId" | "onTurnComplete"
>;

export function runAgentSessionHeadless(
  session: AgentSession,
  options: SessionHeadlessOptions
): Promise<void> {
  return runHeadless({
    ...options,
    agent: session.runtimeAgent,
    messageHistory: session.history,
    sessionId: session.sessionId,
    onTurnComplete: async () => {
      await session.save();
    },
  });
}
