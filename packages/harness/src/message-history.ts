import type { ModelMessage, TextPart, ToolResultPart } from "ai";

const TRAILING_NEWLINES = /\n+$/;

/**
 * Simple token estimator based on character count.
 * Uses a conservative estimate of ~4 characters per token.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract text content from a message for token estimation.
 */
function extractMessageText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .map((part) => {
      if (typeof part === "object" && part !== null) {
        if (part.type === "text") {
          return (part as TextPart).text;
        }
        if (part.type === "tool-call") {
          return `${part.toolName} ${JSON.stringify(part.input)}`;
        }
        if (part.type === "tool-result") {
          return `${part.toolName} ${JSON.stringify(part.output)}`;
        }
      }
      return "";
    })
    .join(" ");
}

/**
 * Calculate estimated token count for an array of messages.
 */
function estimateMessagesTokens(messages: ModelMessage[]): number {
  return messages.reduce((total, msg) => {
    return total + estimateTokens(extractMessageText(msg));
  }, 0);
}

function trimTrailingNewlines(message: ModelMessage): ModelMessage {
  if (message.role !== "assistant") {
    return message;
  }

  const content = message.content;

  if (typeof content === "string") {
    const trimmed = content.replace(TRAILING_NEWLINES, "");
    if (trimmed === content) {
      return message;
    }
    return { ...message, content: trimmed };
  }

  if (!Array.isArray(content) || content.length === 0) {
    return message;
  }

  let lastTextIndex = -1;
  for (let i = content.length - 1; i >= 0; i--) {
    const part = content[i];
    if (part && typeof part === "object" && part.type === "text") {
      lastTextIndex = i;
      break;
    }
  }

  if (lastTextIndex === -1) {
    return message;
  }

  const textPart = content[lastTextIndex] as TextPart;
  const trimmedText = textPart.text.replace(TRAILING_NEWLINES, "");

  if (trimmedText === textPart.text) {
    return message;
  }

  const newContent = [...content];
  newContent[lastTextIndex] = { ...textPart, text: trimmedText };

  return { ...message, content: newContent };
}

export interface Message {
  createdAt: Date;
  id: string;
  modelMessage: ModelMessage;
  originalContent?: string;
}

/**
 * Summary entry representing a compacted batch of messages.
 */
export interface CompactionSummary {
  id: string;
  createdAt: Date;
  summary: string;
  /** ID of the first message that was kept after this summary */
  firstKeptMessageId: string;
  /** Estimated tokens before compaction */
  tokensBefore: number;
  /** Estimated tokens in the summary */
  summaryTokens: number;
}

/**
 * Configuration for the incremental compaction feature.
 */
export interface CompactionConfig {
  /**
   * Enable incremental compaction. When enabled, older messages are
   * summarized when context exceeds token thresholds.
   * @default false
   */
  enabled?: boolean;

  /**
   * Maximum total tokens before triggering compaction.
   * When exceeded, older messages will be summarized.
   * @default 8000
   */
  maxTokens?: number;

  /**
   * Number of recent tokens to preserve from compaction.
   * These messages are always kept in full form.
   * @default 2000
   */
  keepRecentTokens?: number;

  /**
   * Reserve tokens for the response. Compaction triggers when
   * (totalTokens + reserveTokens) > maxTokens.
   * @default 2000
   */
  reserveTokens?: number;

  /**
   * Custom function to summarize a batch of messages.
   * If not provided, a simple concatenation fallback is used.
   */
  summarizeFn?: (messages: ModelMessage[]) => Promise<string>;
}

export interface MessageHistoryOptions {
  /**
   * Maximum number of messages to retain. When exceeded, older messages
   * are trimmed from the front while preserving the initial user message
   * for context continuity. Defaults to 1000.
   */
  maxMessages?: number;

  /**
   * Incremental compaction configuration for managing long contexts.
   * When enabled, older messages are summarized to reduce token usage
   * while preserving important context.
   */
  compaction?: CompactionConfig;
}

const createMessageId = (() => {
  let counter = 0;
  return (): string => {
    counter += 1;
    return `msg_${counter}`;
  };
})();

const DEFAULT_MAX_MESSAGES = 1000;
const DEFAULT_COMPACTION_MAX_TOKENS = 8000;
const DEFAULT_COMPACTION_KEEP_RECENT = 2000;
const DEFAULT_COMPACTION_RESERVE = 2000;

/**
 * Default summarizer that concatenates message content.
 * This is a fallback when no custom summarizer is provided.
 */
async function defaultSummarizeFn(messages: ModelMessage[]): Promise<string> {
  const parts = messages.map((msg) => {
    const role = msg.role;
    const text = extractMessageText(msg);
    return `[${role}]: ${text.slice(0, 500)}${text.length > 500 ? "..." : ""}`;
  });
  return `Previous conversation summary:\n${parts.join("\n")}`;
}

export class MessageHistory {
  private messages: Message[] = [];
  private readonly maxMessages: number;
  private readonly compaction: CompactionConfig;
  private summaries: CompactionSummary[] = [];
  private compactionInProgress = false;

  constructor(options?: MessageHistoryOptions) {
    const max = options?.maxMessages ?? DEFAULT_MAX_MESSAGES;
    if (!Number.isFinite(max) || max < 1 || max !== Math.floor(max)) {
      throw new RangeError(
        `maxMessages must be a positive integer >= 1, got ${max}`
      );
    }
    this.maxMessages = max;

    this.compaction = {
      enabled: options?.compaction?.enabled ?? false,
      maxTokens: options?.compaction?.maxTokens ?? DEFAULT_COMPACTION_MAX_TOKENS,
      keepRecentTokens:
        options?.compaction?.keepRecentTokens ?? DEFAULT_COMPACTION_KEEP_RECENT,
      reserveTokens:
        options?.compaction?.reserveTokens ?? DEFAULT_COMPACTION_RESERVE,
      summarizeFn: options?.compaction?.summarizeFn,
    };
  }

  getAll(): Message[] {
    return [...this.messages];
  }

  getSummaries(): CompactionSummary[] {
    return [...this.summaries];
  }

  clear(): void {
    this.messages = [];
    this.summaries = [];
  }

  /**
   * Check if compaction is enabled.
   */
  isCompactionEnabled(): boolean {
    return this.compaction.enabled === true;
  }

  /**
   * Get the current estimated token count.
   */
  getEstimatedTokens(): number {
    const messagesTokens = estimateMessagesTokens(this.toModelMessages());
    const summariesTokens = this.summaries.reduce(
      (total, s) => total + s.summaryTokens,
      0
    );
    return messagesTokens + summariesTokens;
  }

  /**
   * Trigger compaction manually. Returns true if compaction was performed.
   */
  async compact(): Promise<boolean> {
    if (!this.compaction.enabled || this.messages.length === 0) {
      return false;
    }

    return this.performCompaction();
  }

  addUserMessage(content: string, originalContent?: string): Message {
    const message: Message = {
      id: createMessageId(),
      createdAt: new Date(),
      modelMessage: {
        role: "user",
        content,
      },
      originalContent,
    };
    this.messages.push(message);
    this.enforceLimit();
    void this.checkAndCompact();
    return message;
  }

  addModelMessages(messages: ModelMessage[]): Message[] {
    const created: Message[] = [];
    for (const modelMessage of messages) {
      const processedMessage = trimTrailingNewlines(modelMessage);
      const sanitizedMessage = this.sanitizeMessage(processedMessage);

      const message: Message = {
        id: createMessageId(),
        createdAt: new Date(),
        modelMessage: sanitizedMessage,
      };
      created.push(message);
    }
    this.messages.push(...created);
    this.enforceLimit();
    void this.checkAndCompact();
    return created;
  }

  /**
   * Get messages with compaction summaries prepended as system context.
   * This is the recommended way to get messages for LLM calls when
   * compaction is enabled.
   */
  getMessagesForLLM(): ModelMessage[] {
    const modelMessages = this.toModelMessages();

    if (this.summaries.length === 0) {
      return modelMessages;
    }

    // Combine summaries into a single system message
    const combinedSummary = this.summaries
      .map((s) => `---\n${s.summary}`)
      .join("\n");

    const systemMessage: ModelMessage = {
      role: "system",
      content: `Previous conversation context:\n${combinedSummary}`,
    };

    return [systemMessage, ...modelMessages];
  }

  private async checkAndCompact(): Promise<void> {
    if (!this.compaction.enabled || this.compactionInProgress) {
      return;
    }

    const totalTokens = this.getEstimatedTokens();
    const threshold =
      (this.compaction.maxTokens ?? DEFAULT_COMPACTION_MAX_TOKENS) -
      (this.compaction.reserveTokens ?? DEFAULT_COMPACTION_RESERVE);

    if (totalTokens < threshold) {
      return;
    }

    await this.performCompaction();
  }

  private async performCompaction(): Promise<boolean> {
    if (this.messages.length === 0) {
      return false;
    }

    this.compactionInProgress = true;

    try {
      // Calculate tokens from the end to find what to keep
      const keepRecentTokens =
        this.compaction.keepRecentTokens ?? DEFAULT_COMPACTION_KEEP_RECENT;

      let keptTokens = 0;
      let splitIndex = this.messages.length;

      // Walk backwards to find where to split
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const msgTokens = estimateTokens(
          extractMessageText(this.messages[i].modelMessage)
        );

        if (keptTokens + msgTokens > keepRecentTokens) {
          splitIndex = i + 1;
          break;
        }

        keptTokens += msgTokens;

        // Always keep at least the last turn
        if (i === 0) {
          splitIndex = 0;
        }
      }

      // If nothing to compact, return early
      if (splitIndex === 0) {
        return false;
      }

      // Messages to summarize
      const messagesToSummarize = this.messages.slice(0, splitIndex);
      const messagesToKeep = this.messages.slice(splitIndex);

      if (messagesToSummarize.length === 0) {
        return false;
      }

      // Get the first kept message ID
      const firstKeptMessageId =
        messagesToKeep.length > 0 ? messagesToKeep[0].id : "end";

      // Summarize
      const summarizeFn = this.compaction.summarizeFn ?? defaultSummarizeFn;
      const modelMessagesToSummarize = messagesToSummarize.map(
        (m) => m.modelMessage
      );

      const summary = await summarizeFn(modelMessagesToSummarize);
      const summaryTokens = estimateTokens(summary);

      // Create summary entry
      const summaryEntry: CompactionSummary = {
        id: `summary_${Date.now()}`,
        createdAt: new Date(),
        summary,
        firstKeptMessageId,
        tokensBefore: estimateMessagesTokens(modelMessagesToSummarize),
        summaryTokens,
      };

      this.summaries.push(summaryEntry);
      this.messages = messagesToKeep;

      return true;
    } finally {
      this.compactionInProgress = false;
    }
  }

  private enforceLimit(): void {
    if (this.messages.length <= this.maxMessages) {
      return;
    }

    if (this.maxMessages === 1) {
      this.messages = [this.messages[this.messages.length - 1]];
      return;
    }

    const turnBoundaries: number[] = [];
    for (let i = 1; i < this.messages.length; i++) {
      if (this.messages[i].modelMessage.role === "user") {
        turnBoundaries.push(i);
      }
    }

    if (turnBoundaries.length === 0) {
      this.messages = [
        this.messages[0],
        ...this.messages.slice(-(this.maxMessages - 1)),
      ];
      return;
    }

    for (const boundary of turnBoundaries) {
      const keptCount = 1 + (this.messages.length - boundary);
      if (keptCount <= this.maxMessages) {
        this.messages = [this.messages[0], ...this.messages.slice(boundary)];
        return;
      }
    }

    const lastBoundary = turnBoundaries[turnBoundaries.length - 1];
    const lastBoundaryCandidate = [
      this.messages[0],
      ...this.messages.slice(lastBoundary),
    ];

    if (lastBoundaryCandidate.length <= this.maxMessages) {
      this.messages = lastBoundaryCandidate;
      return;
    }

    this.messages = [
      this.messages[0],
      ...this.messages.slice(-(this.maxMessages - 1)),
    ];
  }

  private sanitizeMessage(message: ModelMessage): ModelMessage {
    if (message.role !== "tool") {
      return message;
    }

    if (!Array.isArray(message.content)) {
      return message;
    }

    const sanitizedContent = message.content.map((part: any) => {
      if (part.type !== "tool-result") {
        return part;
      }

      const sanitizedOutput = this.serializeValue(part.output);

      if (sanitizedOutput === part.output) {
        return part;
      }

      return {
        ...part,
        output: sanitizedOutput as ToolResultPart["output"],
      };
    });

    return {
      ...message,
      content: sanitizedContent,
    };
  }

  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (value instanceof Error) {
      return {
        __error: true,
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.serializeValue(item));
    }

    if (typeof value === "object" && value.constructor === Object) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.serializeValue(val);
      }
      return result;
    }

    return value;
  }

  toModelMessages(): ModelMessage[] {
    return this.messages.map((message) => message.modelMessage);
  }
}
