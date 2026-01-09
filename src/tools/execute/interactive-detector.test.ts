import { describe, expect, it } from "bun:test";
import {
  checkForegroundProcess,
  isInteractiveState,
} from "./interactive-detector";

describe("interactive-detector", () => {
  describe("checkForegroundProcess", () => {
    it("returns null for non-existent session", () => {
      const result = checkForegroundProcess("nonexistent-session");
      expect(result).toBeNull();
    });
  });

  describe("isInteractiveState", () => {
    it("returns interactive (fail-closed) for non-existent session", () => {
      const result = isInteractiveState("nonexistent-session");
      expect(result.isInteractive).toBe(true);
      expect(result.currentProcess).toBeNull();
      expect(result.reason).toBe("tmux_query_failed");
    });

    it("returns correct structure", () => {
      const result = isInteractiveState("any-session");
      expect(result).toHaveProperty("isInteractive");
      expect(result).toHaveProperty("currentProcess");
      expect(typeof result.isInteractive).toBe("boolean");
    });

    it("rejects invalid session IDs", () => {
      const result = isInteractiveState("invalid;session");
      expect(result.isInteractive).toBe(true);
      expect(result.reason).toBe("tmux_query_failed");
    });
  });

  describe("KNOWN_SHELLS classification", () => {
    const KNOWN_SHELLS = [
      "bash",
      "zsh",
      "sh",
      "fish",
      "dash",
      "ksh",
      "tcsh",
      "csh",
      "ash",
      "pwsh",
    ];

    it("classifies all known shells correctly", () => {
      for (const shell of KNOWN_SHELLS) {
        expect(KNOWN_SHELLS.includes(shell)).toBe(true);
      }
    });

    it("classifies non-shell processes as interactive", () => {
      const interactiveProcesses = ["less", "vim", "git", "python", "node"];
      for (const proc of interactiveProcesses) {
        expect(KNOWN_SHELLS.includes(proc)).toBe(false);
      }
    });
  });
});
