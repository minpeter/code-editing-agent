import { spawn } from "node:child_process";
import { getFullWrappedCommand as wrapCommand } from "./noninteractive-wrapper";
import { sanitizeOutput, truncateOutput } from "./output-handler";
import { getShell, getShellArgs } from "./shell-detection";

const DEFAULT_TIMEOUT_MS = 120_000;
const SIGKILL_DELAY_MS = 200;
const SPAWN_ERROR_EXIT_CODE = 1;
const CANCELLED_EXIT_CODE = 130;
const TIMEOUT_EXIT_CODE = 124;
const MAX_IN_MEMORY_OUTPUT_BYTES = 2 * 1024 * 1024;
const TRIMMED_BUFFER_TARGET_BYTES = 512 * 1024;

interface ProcessInfo {
  pid: number;
  sessionId: number;
  startTime: number;
}

const activeProcesses = new Map<number, ProcessInfo>();

export interface ExecuteOptions {
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
  stdin?: "ignore" | "pipe";
  timeoutMs?: number;
  workdir?: string;
}

export interface ExecuteResult {
  cancelled: boolean;
  exitCode: number;
  output: string;
  timedOut: boolean;
}

function hasErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

/**
 * Get the session ID for a process.
 * Returns -1 if the process doesn't exist or we don't have permission.
 */
function getProcessSessionId(pid: number): number {
  if (pid <= 1) {
    return -1;
  }
  try {
    // Use process.kill with signal 0 to check existence first
    process.kill(pid, 0);
    // On Linux/macOS, we can get the session ID via process.getsid if available
    // or by checking /proc/[pid]/stat
    if (typeof process.getsid === "function") {
      return process.getsid(pid);
    }
    // Fallback: try to read from /proc (Linux only)
    try {
      const { readFileSync } = require("node:fs");
      const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
      // Format: pid (comm) state ppid pgrp session tty_nr ...
      const parts = stat.split(" ");
      // Find session field (index varies due to comm containing spaces)
      // The session is the 5th numeric field after the command
      const closeParenIndex = stat.indexOf(")");
      if (closeParenIndex > 0) {
        const afterComm = stat.slice(closeParenIndex + 2); // Skip ") "
        const fields = afterComm.split(" ");
        const sessionId = parseInt(fields[3], 10); // session is 4th field after comm
        if (!isNaN(sessionId)) {
          return sessionId;
        }
      }
    } catch {
      // /proc not available or readable
    }
    // Last resort: return the pid itself as a pseudo-session-id
    // This at least prevents killing processes with different PIDs
    return pid;
  } catch (error) {
    if (hasErrnoCode(error, "ESRCH") || hasErrnoCode(error, "EPERM")) {
      return -1;
    }
    return -1;
  }
}

/**
 * Verify that a process is still the same one we started.
 * This prevents killing unrelated processes after PID recycling.
 */
function verifyProcessIdentity(info: ProcessInfo): boolean {
  // Check if process still exists
  try {
    process.kill(info.pid, 0);
  } catch {
    return false;
  }

  // Check session ID matches
  const currentSessionId = getProcessSessionId(info.pid);
  if (currentSessionId !== info.sessionId) {
    return false;
  }

  return true;
}

function isProcessGroupAlive(pid: number): boolean {
  if (pid <= 1) {
    return false;
  }
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return hasErrnoCode(error, "EPERM");
  }
}

function safeKillProcessGroup(pid: number, signal: NodeJS.Signals): void {
  if (pid <= 1) {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (hasErrnoCode(error, "ESRCH") || hasErrnoCode(error, "EPERM")) {
      return;
    }
    throw error;
  }
}

function resolveExitCode(
  code: number | null,
  timedOut: boolean,
  cancelled: boolean,
  spawnFailed: boolean
): number {
  if (typeof code === "number") {
    return code;
  }

  if (timedOut) {
    return TIMEOUT_EXIT_CODE;
  }

  if (cancelled) {
    return CANCELLED_EXIT_CODE;
  }

  if (spawnFailed) {
    return SPAWN_ERROR_EXIT_CODE;
  }

  return SPAWN_ERROR_EXIT_CODE;
}

function trimToBytes(
  text: string,
  maxBytes: number
): { droppedBytes: number; text: string } {
  const bytes = Buffer.from(text, "utf-8");
  if (bytes.length <= maxBytes) {
    return { text, droppedBytes: 0 };
  }

  const start = bytes.length - maxBytes;

  return {
    text: bytes.subarray(start).toString("utf-8"),
    droppedBytes: start,
  };
}

/**
 * Kill a process tree safely, preventing PID recycling attacks.
 *
 * The processInfo parameter allows verification that we're killing the
 * correct process, not an unrelated process that reused the PID.
 */
export function killProcessTree(
  processInfo: ProcessInfo | number,
  force = false
): void {
  let pid: number;
  let info: ProcessInfo | undefined;

  if (typeof processInfo === "number") {
    pid = processInfo;
    // Try to look up the stored process info
    info = activeProcesses.get(pid);
  } else {
    pid = processInfo.pid;
    info = processInfo;
  }

  if (pid <= 1) {
    return;
  }

  // If we have stored process info, verify the process identity
  // to prevent killing an unrelated process after PID recycling
  if (info && !verifyProcessIdentity(info)) {
    // Process has been recycled or doesn't match our records
    // Remove from tracking and don't kill
    activeProcesses.delete(pid);
    return;
  }

  safeKillProcessGroup(pid, "SIGTERM");

  if (force) {
    safeKillProcessGroup(pid, "SIGKILL");
    activeProcesses.delete(pid);
    return;
  }

  const handle = setTimeout(() => {
    if (!isProcessGroupAlive(pid)) {
      activeProcesses.delete(pid);
      return;
    }
    // Re-verify before SIGKILL
    if (info && !verifyProcessIdentity(info)) {
      activeProcesses.delete(pid);
      return;
    }
    safeKillProcessGroup(pid, "SIGKILL");
    activeProcesses.delete(pid);
  }, SIGKILL_DELAY_MS);

  if (typeof handle === "object" && "unref" in handle) {
    handle.unref();
  }
}

export async function executeCommand(
  command: string,
  options: ExecuteOptions = {}
): Promise<ExecuteResult> {
  const {
    workdir,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    onChunk,
    stdin = "ignore",
  } = options;

  if (signal?.aborted) {
    return {
      exitCode: CANCELLED_EXIT_CODE,
      output: "",
      cancelled: true,
      timedOut: false,
    };
  }

  const shell = getShell();
  const shellArgs = getShellArgs(shell);
  const wrappedCommand = wrapCommand(command);

  return await new Promise<ExecuteResult>((resolve) => {
    const child = spawn(shell, [...shellArgs, wrappedCommand], {
      detached: true,
      stdio: [stdin, "pipe", "pipe"],
      cwd: workdir,
      env: {
        ...process.env,
        TERM: "dumb",
      },
    });

    child.unref();

    let processInfo: ProcessInfo | undefined;

    if (child.pid) {
      // Get the session ID as soon as the process starts
      // This is when we can reliably identify the process
      const sessionId = getProcessSessionId(child.pid);
      processInfo = {
        pid: child.pid,
        sessionId,
        startTime: Date.now(),
      };
      activeProcesses.set(child.pid, processInfo);
    }

    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();
    let bufferedOutput = "";
    let droppedBytes = 0;

    let timedOut = false;
    let cancelled = false;
    let spawnFailed = false;
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      if (processInfo) {
        killProcessTree(processInfo);
      } else if (child.pid) {
        killProcessTree(child.pid);
      }
    }, timeoutMs);

    const abortHandler = () => {
      cancelled = true;
      if (processInfo) {
        killProcessTree(processInfo);
      } else if (child.pid) {
        killProcessTree(child.pid);
      }
    };

    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    const appendChunk = (chunk: Buffer, decoder: TextDecoder): void => {
      const decoded = decoder.decode(chunk, { stream: true });
      bufferedOutput += decoded;
      if (
        Buffer.byteLength(bufferedOutput, "utf-8") > MAX_IN_MEMORY_OUTPUT_BYTES
      ) {
        const trimmed = trimToBytes(
          bufferedOutput,
          TRIMMED_BUFFER_TARGET_BYTES
        );
        bufferedOutput = trimmed.text;
        droppedBytes += trimmed.droppedBytes;
      }
      onChunk?.(decoded);
    };

    const flushDecoder = (decoder: TextDecoder): void => {
      const remaining = decoder.decode();
      if (!remaining) {
        return;
      }
      bufferedOutput += remaining;
      if (
        Buffer.byteLength(bufferedOutput, "utf-8") > MAX_IN_MEMORY_OUTPUT_BYTES
      ) {
        const trimmed = trimToBytes(
          bufferedOutput,
          TRIMMED_BUFFER_TARGET_BYTES
        );
        bufferedOutput = trimmed.text;
        droppedBytes += trimmed.droppedBytes;
      }
      onChunk?.(remaining);
    };

    const finish = (code: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;

      if (child.pid) {
        activeProcesses.delete(child.pid);
      }

      clearTimeout(timeoutHandle);
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      flushDecoder(stdoutDecoder);
      flushDecoder(stderrDecoder);

      const sanitizedOutput = sanitizeOutput(bufferedOutput);
      const withDroppedPrefix =
        droppedBytes > 0
          ? `[... ${droppedBytes} bytes omitted before completion due to output volume ...]\n${sanitizedOutput}`
          : sanitizedOutput;
      truncateOutput(withDroppedPrefix)
        .then((truncatedOutput) => {
          resolve({
            exitCode: resolveExitCode(code, timedOut, cancelled, spawnFailed),
            output: truncatedOutput.text,
            cancelled,
            timedOut,
          });
        })
        .catch((error) => {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to truncate output.";
          resolve({
            exitCode: resolveExitCode(code, timedOut, cancelled, spawnFailed),
            output: `${withDroppedPrefix}\n${errorMessage}`,
            cancelled,
            timedOut,
          });
        });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      appendChunk(chunk, stdoutDecoder);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      appendChunk(chunk, stderrDecoder);
    });

    child.on("close", (code) => {
      finish(code);
    });

    child.on("error", (error) => {
      spawnFailed = true;
      bufferedOutput += `${(error as Error).message}\n`;
      finish(null);
    });
  });
}

export function cleanup(force = false): void {
  for (const [, info] of activeProcesses) {
    try {
      killProcessTree(info, force);
    } catch {
      // Best-effort cleanup: continue killing remaining processes
    }
  }
  activeProcesses.clear();
}

// Export for testing
export { activeProcesses, getProcessSessionId, verifyProcessIdentity };
export type { ProcessInfo };
