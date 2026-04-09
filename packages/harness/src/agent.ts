/**
 * @module agent
 * Core agent factory for the harness package.
 */

import { stepCountIs, streamText } from "ai";
import { AgentError, AgentErrorCode } from "./errors";
import { resolveMCPOption } from "./mcp-init";
import type {
  Agent,
  AgentConfig,
  AgentGuardrails,
  AgentStreamOptions,
  AgentStreamResult,
  ToolCallPart,
} from "./types";

type StreamTextConfig = Parameters<typeof streamText>[0];
type StopConditionInput = {
  steps: Array<{
    toolCalls?: ToolCallPart[];
  }>;
};
type StopCondition = (input: StopConditionInput) => boolean;

const serializeToolCall = (
  toolCall: Pick<ToolCallPart, "input" | "toolName">
) => {
  return JSON.stringify({ input: toolCall.input, toolName: toolCall.toolName });
};

const textResponseReceived = (): StopCondition => {
  return ({ steps }: StopConditionInput) => {
    const lastStep = steps[steps.length - 1];
    if (!lastStep) return false;
    const hasTools = (lastStep.toolCalls?.length ?? 0) > 0;
    return !hasTools;
  };
};

const createGuardedStopCondition = (
  guardrails: AgentGuardrails
): StopCondition => {
  return ({ steps }: StopConditionInput) => {
    const lastStep = steps[steps.length - 1];
    if (!lastStep) return false;

    const lastStepToolCalls = lastStep.toolCalls ?? [];
    if (lastStepToolCalls.length === 0) {
      return true;
    }

    const maxToolCalls = guardrails.maxToolCallsPerTurn ?? 50;
    const totalToolCalls = steps.reduce(
      (sum: number, step) => sum + (step.toolCalls?.length ?? 0),
      0
    );
    if (totalToolCalls >= maxToolCalls) {
      throw new AgentError(
        AgentErrorCode.MAX_TOOL_CALLS,
        `Exceeded maxToolCallsPerTurn (${maxToolCalls})`
      );
    }

    const threshold = guardrails.repeatedToolCallThreshold ?? 3;
    if (threshold > 0) {
      const flattenedToolCalls = steps.flatMap((step) => step.toolCalls ?? []);
      if (flattenedToolCalls.length >= threshold) {
        const recentSequence = flattenedToolCalls.slice(-threshold);
        const firstCall = recentSequence[0];
        const repeatedSignature = serializeToolCall(firstCall);
        const isRepeated = recentSequence.every(
          (toolCall) => serializeToolCall(toolCall) === repeatedSignature
        );

        if (isRepeated) {
          throw new AgentError(
            AgentErrorCode.REPEATED_TOOL_CALL,
            `Detected repeated tool call ${threshold} times in a row: ${firstCall.toolName}`
          );
        }
      }
    }

    return false;
  };
};

/**
 * Creates an {@link Agent} instance that wraps a Vercel AI SDK `streamText` call.
 *
 * @param config - Agent configuration including model, tools, and instructions.
 * @returns An `Agent` object with a `stream()` method for initiating a single turn.
 *
 * @example
 * ```typescript
 * const agent = await createAgent({
 *   model: openai('gpt-4o'),
 *   instructions: 'You are a helpful assistant.',
 *   tools: { get_time: tool({ ... }) },
 * });
 * ```
 */
export async function createAgent(config: AgentConfig): Promise<Agent> {
  let mergedTools = config.tools;
  let closeFn: () => Promise<void> = async () => undefined;

  if (config.mcp !== undefined) {
    const resolved = await resolveMCPOption(config.mcp, config.tools ?? {});
    mergedTools = resolved.tools;
    closeFn = resolved.close;
  }

  const effectiveConfig: AgentConfig =
    mergedTools !== config.tools ? { ...config, tools: mergedTools } : config;

  return {
    config: effectiveConfig,
    close: closeFn,
    /**
     * Initiates a single streaming turn with the given messages.
     * Returns a result object with `fullStream`, `finishReason`, and `response`.
     */
    stream(opts: AgentStreamOptions): AgentStreamResult {
      const system =
        opts.system ??
        (typeof effectiveConfig.instructions === "string"
          ? effectiveConfig.instructions
          : undefined);

      const result = streamText({
        model: effectiveConfig.model,
        tools: effectiveConfig.tools,
        system,
        messages: opts.messages,
        providerOptions: opts.providerOptions,
        maxOutputTokens: opts.maxOutputTokens,
        seed: opts.seed,
        stopWhen:
          effectiveConfig.maxStepsPerTurn !== undefined
            ? stepCountIs(effectiveConfig.maxStepsPerTurn)
            : [
                effectiveConfig.guardrails
                  ? createGuardedStopCondition(effectiveConfig.guardrails)
                  : textResponseReceived(),
              ],
        temperature: opts.temperature,
        abortSignal: opts.abortSignal,
        experimental_repairToolCall:
          effectiveConfig.experimental_repairToolCall,
      });

      const { finishReason, response, usage, totalUsage } = result;

      const swallow = () => undefined;
      finishReason.then(undefined, swallow);
      response.then(undefined, swallow);
      usage.then(undefined, swallow);
      totalUsage.then(undefined, swallow);

      return {
        finishReason,
        fullStream: result.fullStream,
        response,
        usage,
        totalUsage,
      };
    },
  };
}
