import type { CheckpointMessage, PruningConfig } from "./compaction-types";
import { estimateTokens, extractMessageText } from "./token-utils";

// ─── Configuration ───

const DEFAULT_REPLACEMENT_TEXT = "[output pruned — too large]";
const DEFAULT_PROTECT_RECENT_TOKENS = 2000;
const DEFAULT_MIN_SAVINGS_TOKENS = 200;

function isToolResultPart(part: unknown): part is {
  output: unknown;
  toolName: string;
  type: "tool-result";
} {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "tool-result" &&
    "toolName" in part &&
    "output" in part
  );
}

export type { PruningConfig } from "./compaction-types";

/**
 * Result of a pruning operation.
 */
export interface PruneResult {
  /** Messages after pruning (same length as input). */
  messages: CheckpointMessage[];
  /** Number of individual tool outputs that were pruned. */
  prunedCount: number;
  /** Total estimated tokens saved by pruning. */
  prunedTokens: number;
}

/**
 * Prune large tool outputs from messages to reduce token usage.
 *
 * Walks through messages from oldest to newest. Messages within the
 * `protectRecentTokens` window (counted from the end) are never pruned.
 * For older messages with `tool-result` parts, large outputs are replaced
 * with a short stub.
 *
 * @param messages - Active checkpoint-message slice to prune (not mutated)
 * @param config - Pruning configuration
 * @returns Pruned messages array and statistics
 */
export function pruneToolOutputs(
  messages: CheckpointMessage[],
  config: PruningConfig
): PruneResult {
  if (messages.length === 0) {
    return { messages: [], prunedTokens: 0, prunedCount: 0 };
  }

  const protectRecentTokens =
    config.protectRecentTokens ?? DEFAULT_PROTECT_RECENT_TOKENS;
  const minSavingsTokens =
    config.minSavingsTokens ?? DEFAULT_MIN_SAVINGS_TOKENS;
  const protectedToolNames = new Set(config.protectedToolNames ?? []);
  const replacementText = config.replacementText ?? DEFAULT_REPLACEMENT_TEXT;
  const replacementTokens = estimateTokens(replacementText);
  const compactedAt = Date.now();

  // Calculate the protection boundary: walk backwards to find which messages
  // fall within the protectRecentTokens window
  let protectedFromIndex = messages.length;
  let recentTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(extractMessageText(messages[i].message));
    if (recentTokens + msgTokens > protectRecentTokens) {
      protectedFromIndex = i + 1;
      break;
    }
    recentTokens += msgTokens;
    if (i === 0) {
      protectedFromIndex = 0;
    }
  }

  // Walk messages and prune tool outputs outside the protected window
  let totalPrunedTokens = 0;
  let prunedCount = 0;
  const result: CheckpointMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const modelMessage = msg.message;

    // Protected window — keep as-is
    if (i >= protectedFromIndex) {
      result.push(msg);
      continue;
    }

    // Only prune "tool" role messages (which contain tool-result parts)
    if (modelMessage.role !== "tool" || !Array.isArray(modelMessage.content)) {
      result.push(msg);
      continue;
    }

    let messagePruned = false;
    const newContent = modelMessage.content.map((part) => {
      if (!isToolResultPart(part)) {
        return part;
      }

      // Skip protected tool names
      if (protectedToolNames.has(part.toolName)) {
        return part;
      }

      const outputStr =
        typeof part.output === "string"
          ? part.output
          : JSON.stringify(part.output);
      const outputTokens = estimateTokens(outputStr);

      if (outputTokens <= replacementTokens * 2) {
        return part;
      }

      const savedTokens = outputTokens - replacementTokens;
      totalPrunedTokens += savedTokens;
      prunedCount++;
      messagePruned = true;

      return {
        ...part,
        compactedAt,
        output: { type: "text" as const, value: replacementText },
      };
    });

    if (messagePruned) {
      result.push({
        ...msg,
        message: {
          ...modelMessage,
          content: newContent,
        },
      });
    } else {
      result.push(msg);
    }
  }

  // If total savings are below threshold, return original messages unchanged
  if (totalPrunedTokens < minSavingsTokens) {
    return { messages, prunedTokens: 0, prunedCount: 0 };
  }

  return { messages: result, prunedTokens: totalPrunedTokens, prunedCount };
}
