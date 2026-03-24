import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CheckpointHistory } from "./checkpoint-history";
import { SessionStore } from "./session-store";

describe("CheckpointHistory", () => {
  describe("addUserMessage", () => {
    it("returns CheckpointMessage with id, role user, createdAt", () => {
      const h = new CheckpointHistory();
      const msg = h.addUserMessage("hello world");

      expect(msg.id).toBeTruthy();
      expect(msg.message.role).toBe("user");
      expect(msg.message.content).toBe("hello world");
      expect(msg.createdAt).toBeGreaterThan(0);
      expect(msg.isSummary).toBe(false);
    });

    it("generates unique IDs for each message", () => {
      const h = new CheckpointHistory();
      const m1 = h.addUserMessage("a");
      const m2 = h.addUserMessage("b");

      expect(m1.id).not.toBe(m2.id);
    });

    it("preserves originalContent when provided", () => {
      const h = new CheckpointHistory();
      const msg = h.addUserMessage("processed", "original");

      expect(msg.originalContent).toBe("original");
    });
  });

  describe("addModelMessages", () => {
    it("returns array of CheckpointMessages", () => {
      const h = new CheckpointHistory();
      const msgs = h.addModelMessages([
        { role: "assistant", content: "hello" },
        { role: "user", content: "world" },
      ]);

      expect(msgs).toHaveLength(2);
      expect(msgs[0]?.message.role).toBe("assistant");
      expect(msgs[1]?.message.role).toBe("user");
    });
  });

  describe("getAll", () => {
    it("returns all messages in insertion order", () => {
      const h = new CheckpointHistory();
      h.addUserMessage("first");
      h.addUserMessage("second");
      h.addUserMessage("third");

      const all = h.getAll();
      expect(all).toHaveLength(3);
      expect(all[0]?.message.content).toBe("first");
      expect(all[2]?.message.content).toBe("third");
    });

    it("returns empty array for empty history", () => {
      const h = new CheckpointHistory();
      expect(h.getAll()).toEqual([]);
    });
  });

  describe("toModelMessages", () => {
    it("converts CheckpointMessages to ModelMessages", () => {
      const h = new CheckpointHistory();
      h.addUserMessage("hello");

      const msgs = h.toModelMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]?.role).toBe("user");
      expect(msgs[0]?.content).toBe("hello");
    });
  });

  describe("getMessagesForLLM", () => {
    it("returns all messages when no checkpoint set", () => {
      const h = new CheckpointHistory();
      h.addUserMessage("hello");
      h.addModelMessages([{ role: "assistant", content: "world" }]);

      const msgs = h.getMessagesForLLM();
      expect(msgs).toHaveLength(2);
    });
  });

  describe("tool-call/result sequence validation", () => {
    it("removes orphaned tool-result without preceding tool-call", () => {
      const h = new CheckpointHistory();

      h.addModelMessages([
        { role: "user", content: "request" },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "orphaned",
              toolName: "test",
              output: { type: "text", value: "orphan" },
            },
          ],
        },
      ]);

      const msgs = h.getMessagesForLLM();
      const toolMsgs = msgs.filter((m) => m.role === "tool");
      expect(toolMsgs).toHaveLength(0);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]?.role).toBe("user");
    });

    it("removes assistant tool-call without following tool-result", () => {
      const h = new CheckpointHistory();

      h.addModelMessages([
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "read_file",
              input: { path: "foo.ts" },
            },
          ],
        },
        { role: "assistant", content: "next response" },
      ]);

      const msgs = h.getMessagesForLLM();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toEqual({ role: "assistant", content: "next response" });
    });
  });

  describe("persistence", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "ch-test-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("persists messages to JSONL when SessionStore provided", async () => {
      const store = new SessionStore(tmpDir);
      const h = new CheckpointHistory({
        sessionId: "test-session",
        sessionStore: store,
      });

      h.addUserMessage("persist me");

      const loaded = await store.loadSession("test-session");
      expect(loaded).not.toBeNull();
      expect(loaded?.messages).toHaveLength(1);
      expect(loaded?.messages[0]?.message.content).toBe("persist me");
    });

    it("works without SessionStore (in-memory only)", () => {
      const h = new CheckpointHistory();
      h.addUserMessage("in memory");
      expect(h.getAll()).toHaveLength(1);
    });
  });
});
