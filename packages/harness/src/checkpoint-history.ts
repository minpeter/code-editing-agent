import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import type {
  CheckpointMessage,
  CompactionConfig,
  MessageLine,
  PruningConfig,
} from "./compaction-types";
import type { SessionStore } from "./session-store";
import { estimateTokens, extractMessageText } from "./token-utils";

const DEFAULT_COMPACTION_CONFIG: NormalizedCompactionConfig = {
  contextLimit: 0,
  enabled: false,
  maxTokens: 8000,
  keepRecentTokens: 2000,
  reserveTokens: 2000,
  speculativeStartRatio: undefined,
  summarizeFn: undefined,
};

const DEFAULT_PRUNING_CONFIG: Required<PruningConfig> = {
  enabled: false,
  minSavingsTokens: 200,
  protectedToolNames: [],
  protectRecentTokens: 2000,
  replacementText: "[output pruned — too large]",
};

type NormalizedCompactionConfig = Omit<
  Required<CompactionConfig>,
  "speculativeStartRatio" | "summarizeFn"
> &
  Pick<CompactionConfig, "speculativeStartRatio" | "summarizeFn">;

export interface CheckpointHistoryOptions {
  compaction?: CompactionConfig;
  pruning?: PruningConfig;
  sessionId?: string;
  sessionStore?: SessionStore;
}

function hasToolCalls(message: ModelMessage): boolean {
  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return false;
  }

  return message.content.some(
    (part) =>
      typeof part === "object" && part !== null && part.type === "tool-call"
  );
}

export class CheckpointHistory {
  private messages: CheckpointMessage[] = [];
  private readonly summaryMessageId: string | null = null;
  private revision = 0;
  private readonly sessionId: string;
  private readonly sessionStore: SessionStore | null;
  private readonly compactionConfig: NormalizedCompactionConfig;
  private readonly pruningConfig: Required<PruningConfig>;

  constructor(options?: CheckpointHistoryOptions) {
    this.sessionId = options?.sessionId ?? randomUUID();
    this.sessionStore = options?.sessionStore ?? null;
    this.compactionConfig = {
      ...DEFAULT_COMPACTION_CONFIG,
      ...options?.compaction,
    };
    this.pruningConfig = {
      ...DEFAULT_PRUNING_CONFIG,
      ...options?.pruning,
    };
  }

  addUserMessage(content: string, originalContent?: string): CheckpointMessage {
    const message = this.createCheckpointMessage(
      {
        role: "user",
        content,
      },
      originalContent
    );

    this.messages.push(message);
    this.persistMessage(message);
    this.revision += 1;

    return message;
  }

  addModelMessages(messages: ModelMessage[]): CheckpointMessage[] {
    const created = messages.map((message) =>
      this.createCheckpointMessage(message)
    );

    const nextMessages = this.ensureValidToolSequence([
      ...this.messages,
      ...created,
    ]);
    const createdIds = new Set(created.map((message) => message.id));
    const accepted = nextMessages.filter((message) =>
      createdIds.has(message.id)
    );

    this.messages = nextMessages;
    for (const message of accepted) {
      this.persistMessage(message);
    }

    this.revision += 1;
    return accepted;
  }

  getAll(): CheckpointMessage[] {
    return [...this.messages];
  }

  toModelMessages(): ModelMessage[] {
    return this.messages.map((message) => message.message);
  }

  getMessagesForLLM(): ModelMessage[] {
    return this.ensureValidToolSequence([...this.messages]).map(
      (message) => message.message
    );
  }

  getRevision(): number {
    return this.revision;
  }

  getSummaryMessageId(): string | null {
    return this.summaryMessageId;
  }

  getEstimatedTokens(): number {
    return this.messages.reduce(
      (total, checkpointMessage) =>
        total + estimateTokens(extractMessageText(checkpointMessage.message)),
      0
    );
  }

  getCompactionConfig(): Readonly<NormalizedCompactionConfig> {
    return { ...this.compactionConfig };
  }

  getPruningConfig(): Readonly<Required<PruningConfig>> {
    return {
      ...this.pruningConfig,
      protectedToolNames: [...this.pruningConfig.protectedToolNames],
    };
  }

  private createCheckpointMessage(
    message: ModelMessage,
    originalContent?: string
  ): CheckpointMessage {
    return {
      id: randomUUID(),
      createdAt: Date.now(),
      isSummary: false,
      originalContent,
      message,
    };
  }

  private persistMessage(message: CheckpointMessage): void {
    if (!this.sessionStore) {
      return;
    }

    const line: MessageLine = {
      type: "message",
      id: message.id,
      createdAt: message.createdAt,
      isSummary: message.isSummary,
      originalContent: message.originalContent,
      message: message.message,
    };

    this.sessionStore
      .appendMessage(this.sessionId, line)
      .catch(() => undefined);
  }

  private ensureValidToolSequence(
    messages: CheckpointMessage[]
  ): CheckpointMessage[] {
    while (messages.length > 0 && messages[0]?.message.role === "tool") {
      messages.shift();
    }

    let index = 1;
    while (index < messages.length) {
      const current = messages[index];
      if (current?.message.role === "tool") {
        const previous = messages[index - 1];
        if (!(previous && hasToolCalls(previous.message))) {
          messages.splice(index, 1);
          continue;
        }
      }
      index += 1;
    }

    index = 0;
    while (index < messages.length) {
      const current = messages[index];
      if (current && hasToolCalls(current.message)) {
        const nextIndex = index + 1;
        const next = messages[nextIndex];
        if (!next || next.message.role !== "tool") {
          messages.splice(index, 1);
          continue;
        }
      }
      index += 1;
    }

    return messages;
  }
}
