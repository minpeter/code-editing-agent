import type { Command, CommandResult } from "@ai-sdk-tool/harness";
import { agentManager } from "../agent";
import { colorize } from "../interaction/colors";

export interface ModelInfo {
  id: string;
  name?: string;
  type?: "serverless" | "dedicated";
}

export function getAvailableModels(): ModelInfo[] {
  return [];
}

export function findModelBySelection(
  selection: string,
  models: ModelInfo[] = getAvailableModels()
): ModelInfo | undefined {
  const selectedIndex = Number.parseInt(selection, 10) - 1;

  if (
    !Number.isNaN(selectedIndex) &&
    selectedIndex >= 0 &&
    selectedIndex < models.length
  ) {
    return models[selectedIndex];
  }

  return models.find((model) => model.id === selection);
}

export const applyModelSelection = (
  selectedModel: ModelInfo | string
): CommandResult => {
  const nextModelId =
    typeof selectedModel === "string" ? selectedModel : selectedModel.id;

  if (nextModelId === agentManager.getModelId()) {
    return {
      success: true,
      message: `Already using model: ${nextModelId}`,
    };
  }

  agentManager.setModelId(nextModelId);
  if (typeof selectedModel !== "string" && selectedModel.type) {
    agentManager.setModelType(selectedModel.type);
  }

  return {
    success: true,
    message: colorize("green", `Model changed to: ${nextModelId}`),
  };
};

export const createModelCommand = (): Command => ({
  name: "model",
  description: "Show or change the AI model",
  execute: ({ args }): CommandResult => {
    if (args.length === 0) {
      return {
        success: true,
        message: `Current model: ${agentManager.getModelId()}\nUsage: /model <model-id>`,
      };
    }

    const selection = args.join(" ").trim();
    if (!selection) {
      return {
        success: false,
        message: "Usage: /model <model-id>",
      };
    }

    return applyModelSelection(selection);
  },
});
