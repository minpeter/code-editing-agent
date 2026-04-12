import type { ContinuationVariant } from "./compaction-types";

// Based on Goose's proven patterns
const CONTINUATION_TEXTS: Record<ContinuationVariant, string> = {
  auto: "Context has been compacted. I'll continue working on the current task based on the summary.",
  manual:
    "The conversation was summarized above. Continue naturally without mentioning the summary or that compaction occurred.",
  "auto-with-replay":
    "Previous context was summarized above. The user's latest request follows — respond to it directly and naturally.",
  "tool-loop":
    "Context was compacted mid-task. Resume your work and continue with any pending tool calls or steps.",
  overflow:
    "The context was compacted due to overflow. I'll resume the task from where we left off.",
};

export interface ContinuationMessageData {
  content: string;
  isContinuation: true;
  role: "assistant";
  variant: ContinuationVariant;
}

export function createContinuationMessage(
  variant: ContinuationVariant
): ContinuationMessageData {
  return {
    role: "assistant",
    content: CONTINUATION_TEXTS[variant],
    isContinuation: true,
    variant,
  };
}

export function getContinuationText(variant: ContinuationVariant): string {
  return CONTINUATION_TEXTS[variant];
}
