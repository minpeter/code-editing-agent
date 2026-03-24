import type { ModelMessage } from "ai";

// --- Core Message Types ---

/** A CheckpointMessage extends ModelMessage with tracking metadata */
export interface CheckpointMessage {
  createdAt: number; // Date.now()
  id: string; // nanoid (e.g. nanoid(10))
  isSummary: boolean; // true if this is a compaction summary message
  message: ModelMessage; // the underlying AI SDK message
  originalContent?: string; // preserved original content before any rewrite
}

// --- Session Metadata ---

export interface SessionMetadata {
  completionTokens: number;
  createdAt: number;
  promptTokens: number;
  sessionId: string;
  summaryMessageId: string | null; // checkpoint pointer, null = no compaction yet
  updatedAt: number;
}

// --- Configuration ---

export interface CompactionConfig {
  contextLimit?: number; // model context window limit (0 = unlimited)
  enabled?: boolean; // default: false
  keepRecentTokens?: number; // default: 2000 — tokens to keep uncompacted
  maxTokens?: number; // default: 8000 — max tokens before compaction
  reserveTokens?: number; // default: 2000 — tokens reserved for output
  speculativeStartRatio?: number; // optional: ratio [0.15-0.95] for speculative start
  summarizeFn?: (
    messages: ModelMessage[],
    previousSummary?: string
  ) => Promise<string>;
}

export interface PruningConfig {
  enabled?: boolean; // default: false
  minSavingsTokens?: number; // default: 200
  protectedToolNames?: string[]; // tools to never prune
  protectRecentTokens?: number; // default: 2000
  replacementText?: string; // default: "[output pruned — too large]"
}

// --- Continuation ---

export type ContinuationVariant = "manual" | "auto-with-replay" | "tool-loop";

// --- Compaction Results ---

export interface CompactionResult {
  continuationVariant?: ContinuationVariant;
  reason?: string; // why compaction failed, if success=false
  success: boolean;
  summaryMessageId?: string;
  tokensAfter: number;
  tokensBefore: number;
}

export interface PreparedCompactionV2 {
  baseMessageIds: string[];
  replayMessage?: CheckpointMessage; // message to replay after compaction
  revision: number;
  splitIndex: number;
  summaryText: string;
  tokenDelta: number;
}

// --- Token Tracking ---

export interface ActualTokenUsage {
  completionTokens?: number;
  promptTokens?: number;
  totalTokens?: number;
  updatedAt?: number;
}

export interface ContextUsage {
  limit: number;
  percentage: number; // 0-100
  remaining: number;
  source: "actual" | "estimated";
  used: number;
}

// --- Structured State (for summary injection) ---

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface StructuredState {
  metadata?: Record<string, unknown>;
  todos?: TodoItem[];
}

// --- JSONL Persistence Line Types ---

export interface SessionHeaderLine {
  createdAt: number;
  sessionId: string;
  type: "header";
  version: 1;
}

export interface MessageLine {
  createdAt: number;
  id: string;
  isSummary: boolean;
  message: ModelMessage;
  originalContent?: string;
  type: "message";
}

export interface CheckpointLine {
  summaryMessageId: string;
  type: "checkpoint";
  updatedAt: number;
}

export type SessionFileLine = SessionHeaderLine | MessageLine | CheckpointLine;
