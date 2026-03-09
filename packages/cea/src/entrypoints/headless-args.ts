import type { ProviderType } from "../agent";
import {
  parseProviderArg,
  parseReasoningCliOption,
  parseToolFallbackCliOption,
  parseTranslateCliOption,
} from "../cli-args";
import type { ReasoningMode } from "../reasoning-mode";
import {
  DEFAULT_TOOL_FALLBACK_MODE,
  type ToolFallbackMode,
} from "../tool-fallback-mode";

export interface ParsedHeadlessArgs {
  maxIterations?: number;
  model?: string;
  prompt: string;
  provider: ProviderType | null;
  reasoningMode: ReasoningMode | null;
  toolFallbackMode: ToolFallbackMode;
  translateUserPrompts: boolean;
}

export const parsePromptOrModelOption = (
  args: string[],
  index: number
): { consumedArgs: number; kind: "prompt" | "model"; value: string } | null => {
  const arg = args[index];
  const value = args[index + 1] || "";
  if (arg === "-p" || arg === "--prompt") {
    return { consumedArgs: 1, kind: "prompt", value };
  }
  if (arg === "-m" || arg === "--model") {
    return { consumedArgs: 1, kind: "model", value };
  }
  return null;
};

export const parseMaxIterations = (
  args: string[],
  index: number
): { consumedArgs: number; value: number } | null => {
  if (args[index] !== "--max-iterations" || index + 1 >= args.length) {
    return null;
  }
  const value = Number.parseInt(args[index + 1], 10);
  if (Number.isNaN(value) || value <= 0) {
    return null;
  }
  return { value, consumedArgs: 1 };
};

export const parseProviderOption = (
  args: string[],
  index: number
): { consumedArgs: number; provider: ProviderType | null } | null => {
  if (args[index] !== "--provider" || index + 1 >= args.length) {
    return null;
  }
  return { provider: parseProviderArg(args[index + 1]), consumedArgs: 1 };
};

export const parseArgs = (): ParsedHeadlessArgs => {
  const args = process.argv.slice(2);
  let prompt = "";
  let model: string | undefined;
  let provider: ProviderType | null = null;
  let reasoningMode: ReasoningMode | null = null;
  let toolFallbackMode: ToolFallbackMode = DEFAULT_TOOL_FALLBACK_MODE;
  let translateUserPrompts = true;
  let maxIterations: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const promptOrModelOption = parsePromptOrModelOption(args, index);
    if (promptOrModelOption) {
      if (promptOrModelOption.kind === "prompt") {
        prompt = promptOrModelOption.value;
      } else {
        model = promptOrModelOption.value || undefined;
      }
      index += promptOrModelOption.consumedArgs;
      continue;
    }

    const reasoningOption = parseReasoningCliOption(args, index);
    if (reasoningOption) {
      reasoningMode = reasoningOption.mode;
      index += reasoningOption.consumedArgs;
      continue;
    }

    const providerOption = parseProviderOption(args, index);
    if (providerOption) {
      if (providerOption.provider) {
        provider = providerOption.provider;
      }
      index += providerOption.consumedArgs;
      continue;
    }

    const translateOption = parseTranslateCliOption(args[index]);
    if (translateOption !== null) {
      translateUserPrompts = translateOption;
      continue;
    }

    const toolFallbackOption = parseToolFallbackCliOption(args, index);
    if (toolFallbackOption) {
      toolFallbackMode = toolFallbackOption.mode;
      index += toolFallbackOption.consumedArgs;
      continue;
    }

    const maxIterOption = parseMaxIterations(args, index);
    if (maxIterOption) {
      maxIterations = maxIterOption.value;
      index += maxIterOption.consumedArgs;
    }
  }

  if (!prompt) {
    console.error(
      "Usage: bun run src/entrypoints/headless.ts -p <prompt> [-m <model>] [--provider anthropic|friendli] [--translate|--no-translate] [--think] [--reasoning-mode <off|on|interleaved|preserved>] [--tool-fallback [mode]] [--toolcall-mode <mode>] [--max-iterations <n>]"
    );
    process.exit(1);
  }

  return {
    prompt,
    model,
    provider,
    reasoningMode,
    toolFallbackMode,
    translateUserPrompts,
    maxIterations,
  };
};
