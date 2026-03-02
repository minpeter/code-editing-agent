import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activeProcesses,
  executeCommand,
  getProcessSessionId,
  killProcessTree,
  type ProcessInfo,
  verifyProcessIdentity,
} from "./process-manager";
import { getShell, getShellArgs } from "./shell-detection";

const FIVE_SECONDS_MS = 5000;
const SIGKILL_GRACE_MS = 1000;
const ABORT_DELAY_MS = 50;
const SHORT_TIMEOUT_MS = 100;

function hasErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return hasErrnoCode(error, "EPERM");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("process-manager", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "process-manager-test-"));
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns exact command result for echo hello", async () => {
    const result = await executeCommand("echo hello");

    expect(result).toEqual({
      exitCode: 0,
      output: "hello\n",
      cancelled: false,
      timedOut: false,
    });
  });

  it("returns non-zero exit code for failing command", async () => {
    const result = await executeCommand("exit 1");

    expect(result.exitCode).toBe(1);
    expect(result.cancelled).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it("executes commands in provided workdir", async () => {
    const result = await executeCommand("pwd", { workdir: tempDir });
    const actualWorkdir = realpathSync(result.output.trim());
    const expectedWorkdir = realpathSync(tempDir);

    expect(result.exitCode).toBe(0);
    expect(actualWorkdir).toBe(expectedWorkdir);
  });

  it("uses stdin ignore by default", async () => {
    const startedAt = Date.now();
    const result = await executeCommand("cat", { timeoutMs: FIVE_SECONDS_MS });
    const elapsed = Date.now() - startedAt;

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(elapsed).toBeLessThan(FIVE_SECONDS_MS);
  });

  it("streams combined chunks through onChunk callback", async () => {
    const streamedChunks: string[] = [];

    const result = await executeCommand(
      "printf 'stdout-chunk'; printf 'stderr-chunk' >&2",
      {
        onChunk: (chunk) => {
          streamedChunks.push(chunk);
        },
      }
    );

    const streamedOutput = streamedChunks.join("");

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("stdout-chunk");
    expect(result.output).toContain("stderr-chunk");
    expect(streamedChunks.length).toBeGreaterThan(0);
    expect(streamedOutput).toContain("stdout-chunk");
    expect(streamedOutput).toContain("stderr-chunk");
  });

  it("sets timedOut=true and kills process within 5 seconds", async () => {
    const startedAt = Date.now();
    const result = await executeCommand("trap '' TERM; sleep 30", {
      timeoutMs: SHORT_TIMEOUT_MS,
    });
    const elapsed = Date.now() - startedAt;

    expect(result.timedOut).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.exitCode).toBe(124);
    expect(elapsed).toBeLessThan(FIVE_SECONDS_MS);
  }, 10_000);

  it("supports AbortSignal cancellation", async () => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const command = executeCommand("sleep 30", { signal: controller.signal });

    setTimeout(() => {
      controller.abort();
    }, ABORT_DELAY_MS);

    const result = await command;
    const elapsed = Date.now() - startedAt;

    expect(result.cancelled).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(130);
    expect(elapsed).toBeLessThan(FIVE_SECONDS_MS);
  }, 10_000);

  it("killProcessTree terminates detached process groups", async () => {
    const shell = getShell();
    const shellArgs = getShellArgs(shell);
    const child = spawn(shell, [...shellArgs, "trap '' TERM; sleep 30"], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    });

    const pid = child.pid;
    expect(pid).toBeDefined();

    if (!pid) {
      throw new Error("Expected detached child pid to be defined");
    }

    // Create ProcessInfo with current session
    const sessionId = getProcessSessionId(pid);
    const processInfo: ProcessInfo = {
      pid,
      sessionId,
      startTime: Date.now(),
    };

    try {
      await sleep(ABORT_DELAY_MS);
      killProcessTree(processInfo);
      await sleep(SIGKILL_GRACE_MS);

      expect(isProcessAlive(pid)).toBe(false);
    } finally {
      killProcessTree(processInfo);
    }
  }, 10_000);

  it("does not use spawnSync", async () => {
    const source = await Bun.file(
      new URL("./process-manager.ts", import.meta.url)
    ).text();

    expect(source.includes("spawnSync")).toBe(false);
  });

  describe("PID recycling safety", () => {
    it("getProcessSessionId returns valid session ID for existing process", async () => {
      const shell = getShell();
      const shellArgs = getShellArgs(shell);
      const child = spawn(shell, [...shellArgs, "sleep 10"], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });

      const pid = child.pid;
      if (!pid) {
        throw new Error("Expected pid to be defined");
      }

      try {
        const sessionId = getProcessSessionId(pid);
        // Session ID should be positive (valid) on Linux
        expect(sessionId).toBeGreaterThan(0);
      } finally {
        child.kill();
        await sleep(100);
      }
    }, 5000);

    it("getProcessSessionId returns -1 for non-existent process", () => {
      // Use a very high PID that's unlikely to exist
      const sessionId = getProcessSessionId(999_999);
      expect(sessionId).toBe(-1);
    });

    it("verifyProcessIdentity returns true for valid process", async () => {
      const shell = getShell();
      const shellArgs = getShellArgs(shell);
      const child = spawn(shell, [...shellArgs, "sleep 10"], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });

      const pid = child.pid;
      if (!pid) {
        throw new Error("Expected pid to be defined");
      }

      const sessionId = getProcessSessionId(pid);
      const processInfo: ProcessInfo = {
        pid,
        sessionId,
        startTime: Date.now(),
      };

      try {
        expect(verifyProcessIdentity(processInfo)).toBe(true);
      } finally {
        child.kill();
        await sleep(100);
      }
    }, 5000);

    it("verifyProcessIdentity returns false for recycled PID simulation", async () => {
      const shell = getShell();
      const shellArgs = getShellArgs(shell);
      const child = spawn(shell, [...shellArgs, "sleep 10"], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });

      const pid = child.pid;
      if (!pid) {
        throw new Error("Expected pid to be defined");
      }

      const sessionId = getProcessSessionId(pid);

      // Kill the original process
      child.kill();
      await sleep(200);

      // Simulate a "recycled" PID by creating ProcessInfo with wrong session
      const fakeProcessInfo: ProcessInfo = {
        pid,
        sessionId: sessionId + 9999, // Wrong session ID
        startTime: Date.now(),
      };

      // If PID hasn't been recycled yet, process won't exist
      // If it has been recycled, session won't match
      expect(verifyProcessIdentity(fakeProcessInfo)).toBe(false);
    }, 5000);

    it("killProcessTree does not kill process with mismatched session", async () => {
      const shell = getShell();
      const shellArgs = getShellArgs(shell);

      // Start a victim process that we'll try to kill with wrong identity
      const victim = spawn(shell, [...shellArgs, "sleep 10"], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });

      const victimPid = victim.pid;
      if (!victimPid) {
        throw new Error("Expected pid to be defined");
      }

      try {
        // Create ProcessInfo with wrong session (simulating recycled PID scenario)
        const fakeProcessInfo: ProcessInfo = {
          pid: victimPid,
          sessionId: 999_999, // Wrong session ID
          startTime: Date.now(),
        };

        // Attempt to kill with wrong identity
        killProcessTree(fakeProcessInfo, true);

        await sleep(SIGKILL_GRACE_MS);

        // Victim should still be alive because session didn't match
        expect(isProcessAlive(victimPid)).toBe(true);
      } finally {
        victim.kill();
        await sleep(100);
      }
    }, 5000);

    it("activeProcesses tracks processes correctly", async () => {
      const shell = getShell();
      const shellArgs = getShellArgs(shell);

      // Clear any existing tracked processes
      activeProcesses.clear();

      const child = spawn(shell, [...shellArgs, "sleep 10"], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });

      const pid = child.pid;
      if (!pid) {
        throw new Error("Expected pid to be defined");
      }

      // Manually add to activeProcesses to simulate executeCommand behavior
      const sessionId = getProcessSessionId(pid);
      const processInfo: ProcessInfo = {
        pid,
        sessionId,
        startTime: Date.now(),
      };
      activeProcesses.set(pid, processInfo);

      try {
        expect(activeProcesses.has(pid)).toBe(true);
        expect(activeProcesses.get(pid)?.pid).toBe(pid);
        expect(activeProcesses.get(pid)?.sessionId).toBe(sessionId);

        // Kill the process
        killProcessTree(pid, true);
        await sleep(SIGKILL_GRACE_MS);

        // Process should be removed from tracking after kill
        expect(activeProcesses.has(pid)).toBe(false);
      } finally {
        child.kill();
        activeProcesses.delete(pid);
      }
    }, 5000);
  });
});
