import type { AgentSession } from "@ai-sdk-tool/harness/runtime";

import { createAgentTUI, type AgentTUIConfig } from "./agent-tui";

export type SessionTUIOptions = Omit<
  AgentTUIConfig,
  "agent" | "messageHistory" | "commands" | "skills"
>;

export function runAgentSessionTUI(
  session: AgentSession,
  options?: SessionTUIOptions
): Promise<void> {
  const { onTurnComplete, ...rest } = options ?? {};

  return createAgentTUI({
    ...rest,
    agent: session.runtimeAgent,
    messageHistory: session.history,
    skills: session.skills,
    commands: session.commands,
    onTurnComplete: async (...args) => {
      await session.save();
      await onTurnComplete?.(...args);
    },
  });
}
