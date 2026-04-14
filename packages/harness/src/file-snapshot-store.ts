import { mkdirSync } from "node:fs";
import type { HistorySnapshot } from "./history-snapshot";
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

    if (session.historySnapshot) {
      return session.historySnapshot;
    }

    return {
      messages: session.messages.map((messageLine) => ({
        id: messageLine.id,
        message: messageLine.message,
        createdAt: messageLine.createdAt,
        isSummary: messageLine.isSummary,
        originalContent: messageLine.originalContent,
      })),
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
    await this.sessionStore.replaceSessionSnapshot(sessionId, snapshot);
  }

  async delete(sessionId: string): Promise<void> {
    await this.sessionStore.deleteSession(sessionId);
  }
}
