import { appendFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeSessionId, SessionStore } from "./session-store";

describe("SessionStore", () => {
  let tmpDir: string;
  let store: SessionStore;

  const expectSessionData = <T>(value: T | null): T => {
    if (value === null) {
      throw new Error("Expected session data");
    }
    return value;
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-store-test-"));
    store = new SessionStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { force: true, recursive: true });
  });

  it("returns null for non-existent session", async () => {
    const result = await store.loadSession("nonexistent");
    expect(result).toBeNull();
  });

  it("round-trip: 10 messages survive write→read", async () => {
    const sessionId = "test-session-1";

    for (let i = 0; i < 10; i++) {
      await store.appendMessage(sessionId, {
        type: "message",
        id: `msg-${i}`,
        createdAt: Date.now(),
        isSummary: false,
        message: { role: "user", content: `message ${i}` },
      });
    }

    const result = expectSessionData(await store.loadSession(sessionId));
    expect(result.messages).toHaveLength(10);
    expect(result.messages[0].id).toBe("msg-0");
    expect(result.messages[9].id).toBe("msg-9");
  });

  it("checkpoint: updateCheckpoint updates summaryMessageId", async () => {
    const sessionId = "test-session-2";

    await store.appendMessage(sessionId, {
      type: "message",
      id: "msg-1",
      createdAt: Date.now(),
      isSummary: false,
      message: { role: "user", content: "hello" },
    });

    await store.updateCheckpoint(sessionId, "msg-1");

    const result = expectSessionData(await store.loadSession(sessionId));
    expect(result.summaryMessageId).toBe("msg-1");
  });

  it("corruption: truncated last line is skipped, rest loaded", async () => {
    const sessionId = "test-session-3";

    await store.appendMessage(sessionId, {
      type: "message",
      id: "msg-1",
      createdAt: Date.now(),
      isSummary: false,
      message: { role: "user", content: "first" },
    });

    await store.appendMessage(sessionId, {
      type: "message",
      id: "msg-2",
      createdAt: Date.now(),
      isSummary: false,
      message: { role: "assistant", content: "second" },
    });

    const filePath = join(tmpDir, `${sessionId}.jsonl`);
    appendFileSync(filePath, '{"type":"message","id":"corrupt-line-incomplete');

    const result = expectSessionData(await store.loadSession(sessionId));
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1].id).toBe("msg-2");
  });

  it("multiple checkpoints: latest checkpoint wins", async () => {
    const sessionId = "test-session-4";

    await store.appendMessage(sessionId, {
      type: "message",
      id: "msg-1",
      createdAt: Date.now(),
      isSummary: false,
      message: { role: "user", content: "hello" },
    });
    await store.updateCheckpoint(sessionId, "msg-1");

    await store.appendMessage(sessionId, {
      type: "message",
      id: "msg-2",
      createdAt: Date.now(),
      isSummary: true,
      message: { role: "user", content: "summary" },
    });
    await store.updateCheckpoint(sessionId, "msg-2");

    const result = expectSessionData(await store.loadSession(sessionId));
    expect(result.summaryMessageId).toBe("msg-2");
  });

  it("deleteSession removes session file", async () => {
    const sessionId = "test-session-5";

    await store.appendMessage(sessionId, {
      type: "message",
      id: "msg-1",
      createdAt: Date.now(),
      isSummary: false,
      message: { role: "user", content: "hello" },
    });

    let result = expectSessionData(await store.loadSession(sessionId));
    expect(result.messages).toHaveLength(1);

    await store.deleteSession(sessionId);

    result = await store.loadSession(sessionId);
    expect(result).toBeNull();
  });

  it("deleteSession is no-op for non-existent session", async () => {
    const sessionId = "nonexistent-session";

    await expect(store.deleteSession(sessionId)).resolves.toBeUndefined();
  });

  it("accepts namespaced session IDs containing colons", async () => {
    const sessionId = "telegram:chat:-1001234:topic:5";

    await store.appendMessage(sessionId, {
      type: "message",
      id: "msg-1",
      createdAt: Date.now(),
      isSummary: false,
      message: { role: "user", content: "hello from telegram" },
    });

    const result = expectSessionData(await store.loadSession(sessionId));
    expect(result.messages).toHaveLength(1);
    expect(result.sessionId).toBe(sessionId);

    const encoded = encodeSessionId(sessionId);
    expect(existsSync(join(tmpDir, `${encoded}.jsonl`))).toBe(true);

    await store.deleteSession(sessionId);
    expect(await store.loadSession(sessionId)).toBeNull();
  });

  it("encodeSessionId is backwards-compatible for simple IDs", () => {
    expect(encodeSessionId("test-session-1")).toBe("test-session-1");
    expect(encodeSessionId("abc_def-123")).toBe("abc_def-123");
  });

  it("encodeSessionId escapes special characters deterministically", () => {
    expect(encodeSessionId("a:b")).toBe("a_3ab");
    expect(encodeSessionId("foo/bar")).toBe("foo_2fbar");
    expect(encodeSessionId("a.b.c")).toBe("a_2eb_2ec");
  });

  it("encodeSessionId rejects empty string", () => {
    expect(() => encodeSessionId("")).toThrow("sessionId must not be empty");
  });
});
