import { mkdirSync } from "node:fs";
import {
  deserializeMessage,
  type HistorySnapshot,
  serializeMessage,
} from "./history-snapshot";
import { SessionStore } from "./session-store";
import type { SnapshotStore } from "./snapshot-store";

export class FileSnapshotStore implements SnapshotStore {
  private readonly sessionStore: SessionStore;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.sessionStore = new SessionStore(baseDir);
  }

  async load(sessionId: string): Promise<HistorySnapshot | null> {
    const session = await this.sessionStore.loadSession(sessionId);

    if (session === null) {
      return null;
    }

    return {
      messages: session.messages.map((messageLine) =>
        serializeMessage({
          id: messageLine.id,
          message: messageLine.message,
          createdAt: messageLine.createdAt,
          isSummary: messageLine.isSummary,
          isSummaryMessage: messageLine.isSummary,
          originalContent: messageLine.originalContent,
        })
      ),
      revision: 0,
      contextLimit: 0,
      systemPromptTokens: 0,
      toolSchemasTokens: 0,
      compactionState: {
        summaryMessageId: session.summaryMessageId,
      },
    };
  }

  async save(sessionId: string, snapshot: HistorySnapshot): Promise<void> {
    await this.sessionStore.deleteSession(sessionId);

    for (const serializedMessage of snapshot.messages) {
      const message = deserializeMessage(serializedMessage);
      await this.sessionStore.appendMessage(sessionId, {
        type: "message",
        id: message.id,
        message: message.message,
        createdAt: message.createdAt,
        isSummary: message.isSummary,
        originalContent: message.originalContent,
      });
    }

    const summaryMessageId = snapshot.compactionState?.summaryMessageId;

    if (summaryMessageId) {
      await this.sessionStore.updateCheckpoint(sessionId, summaryMessageId);
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.sessionStore.deleteSession(sessionId);
  }
}
