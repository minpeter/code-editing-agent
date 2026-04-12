import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HistorySnapshot } from "./history-snapshot";
import { FileSnapshotStore } from "./file-snapshot-store";

describe("FileSnapshotStore", () => {
  let tmpDir: string;
  let store: FileSnapshotStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "file-snapshot-store-test-"));
    store = new FileSnapshotStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null for unknown session", async () => {
    expect(await store.load("unknown")).toBeNull();
  });

  it("save → load round-trip preserves messages", async () => {
    const snapshot: HistorySnapshot = {
      messages: [
        {
          id: "msg1",
          message: { role: "user", content: "hello" },
          createdAt: 123,
          isSummary: false,
        },
      ],
      revision: 7,
      contextLimit: 1024,
      systemPromptTokens: 11,
      toolSchemasTokens: 13,
      compactionState: { summaryMessageId: null },
    };

    await store.save("session1", snapshot);
    const loaded = await store.load("session1");

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual({
      messages: [
        {
          id: "msg1",
          message: { role: "user", content: "hello" },
          createdAt: 123,
          isSummary: false,
          originalContent: undefined,
          tokenCount: undefined,
        },
      ],
      revision: 0,
      contextLimit: 0,
      systemPromptTokens: 0,
      toolSchemasTokens: 0,
      compactionState: { summaryMessageId: null },
    });
  });

  it("delete removes session", async () => {
    const snapshot: HistorySnapshot = {
      messages: [],
      revision: 0,
      contextLimit: 0,
      systemPromptTokens: 0,
      toolSchemasTokens: 0,
    };

    await store.save("session1", snapshot);
    await store.delete("session1");

    expect(await store.load("session1")).toBeNull();
  });

  it("second save replaces first (replace semantics)", async () => {
    const firstSnapshot: HistorySnapshot = {
      messages: [
        {
          id: "1",
          message: { role: "user", content: "first" },
          createdAt: 1,
          isSummary: false,
        },
      ],
      revision: 0,
      contextLimit: 0,
      systemPromptTokens: 0,
      toolSchemasTokens: 0,
    };
    const secondSnapshot: HistorySnapshot = {
      messages: [
        {
          id: "2",
          message: { role: "user", content: "second" },
          createdAt: 2,
          isSummary: false,
        },
      ],
      revision: 0,
      contextLimit: 0,
      systemPromptTokens: 0,
      toolSchemasTokens: 0,
    };

    await store.save("session", firstSnapshot);
    await store.save("session", secondSnapshot);

    const loaded = await store.load("session");

    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.messages[0]?.id).toBe("2");
    expect(loaded?.messages[0]?.message.content).toBe("second");
  });

  it("round-trips checkpoint summary message id", async () => {
    const snapshot: HistorySnapshot = {
      messages: [
        {
          id: "summary",
          message: { role: "assistant", content: "summary" },
          createdAt: 1,
          isSummary: true,
        },
      ],
      revision: 0,
      contextLimit: 0,
      systemPromptTokens: 0,
      toolSchemasTokens: 0,
      compactionState: { summaryMessageId: "summary" },
    };

    await store.save("session", snapshot);

    await expect(store.load("session")).resolves.toMatchObject({
      compactionState: { summaryMessageId: "summary" },
      messages: [
        expect.objectContaining({
          id: "summary",
          isSummary: true,
        }),
      ],
    });
  });

  it("loads existing legacy JSONL sessions", async () => {
    const sessionId = "legacy_session";
    const filePath = join(tmpDir, `${sessionId}.jsonl`);

    appendFileSync(
      filePath,
      `${JSON.stringify({
        type: "header",
        sessionId,
        createdAt: 10,
        version: 1,
      })}\n${JSON.stringify({
        type: "message",
        id: "legacy-msg",
        createdAt: 20,
        isSummary: false,
        message: { role: "user", content: "from legacy" },
      })}\n${JSON.stringify({
        type: "checkpoint",
        summaryMessageId: "legacy-msg",
        updatedAt: 30,
      })}\n`
    );

    await expect(store.load(sessionId)).resolves.toEqual({
      messages: [
        {
          id: "legacy-msg",
          message: { role: "user", content: "from legacy" },
          createdAt: 20,
          isSummary: false,
          originalContent: undefined,
          tokenCount: undefined,
        },
      ],
      revision: 0,
      contextLimit: 0,
      systemPromptTokens: 0,
      toolSchemasTokens: 0,
      compactionState: { summaryMessageId: "legacy-msg" },
    });
  });
});
