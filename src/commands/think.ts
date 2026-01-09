import { agentManager } from "../agent";
import { createToggleCommand } from "./factories/create-toggle-command";
import type { Command } from "./types";

export const createThinkCommand = (): Command =>
  createToggleCommand({
    name: "think",
    description: "Toggle reasoning mode on/off",
    getter: () => agentManager.isThinkingEnabled(),
    setter: (value) => agentManager.setThinkingEnabled(value),
    featureName: "Reasoning",
    enabledMessage: "Reasoning enabled",
    disabledMessage: "Reasoning disabled",
  });
