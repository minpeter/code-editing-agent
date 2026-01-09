import {
  detectInteractivePrompt,
  formatDetectionResults,
} from "./interactive-detector.js";

const TERMINAL_SCREEN_PREFIX = "=== Current Terminal Screen ===";
const TERMINAL_SCREEN_SUFFIX = "=== End of Screen ===";

const CEA_START_MARKER_PATTERN = /__CEA_S_\d+-\d+__/g;
const CEA_EXIT_MARKER_PATTERN = /__CEA_E_\d+-\d+_\d+__/g;

const CEA_START_MARKER_FRAGMENT_LINE_PATTERN =
  /^\s*__CEA_S_\d+-\d+_*(?:__)?\s*$/;
const CEA_EXIT_MARKER_FRAGMENT_LINE_PATTERN =
  /^\s*__CEA_E_\d+-\d+_\d*_*(?:__)?\s*$/;

const CEA_WRAPPER_COMMAND_LINE_PATTERN = /\becho\s+__CEA_S_\d+-\d+__/;
const TMUX_WAIT_INTERNAL_SUFFIX_PATTERN =
  /\s*;?\s*tmux\s+wait\s+-S\s+cea-[0-9a-z-]+\s*$/i;

const SYSTEM_REMINDER_PREFIX = "[SYSTEM REMINDER]";
const TIMEOUT_PREFIX = "[TIMEOUT]";
const BACKGROUND_PREFIX = "[Background process started]";

export function stripInternalMarkers(content: string): string {
  if (!content.includes("__CEA_") && !content.includes("tmux wait")) {
    return content.trim();
  }

  const cleanedLines: string[] = [];

  for (const line of content.split("\n")) {
    const trimmedLine = line.trim();

    if (
      trimmedLine &&
      (CEA_START_MARKER_FRAGMENT_LINE_PATTERN.test(trimmedLine) ||
        CEA_EXIT_MARKER_FRAGMENT_LINE_PATTERN.test(trimmedLine))
    ) {
      continue;
    }

    if (CEA_WRAPPER_COMMAND_LINE_PATTERN.test(line)) {
      continue;
    }

    const withoutWait = line.replace(TMUX_WAIT_INTERNAL_SUFFIX_PATTERN, "");
    const withoutMarkers = withoutWait
      .replace(CEA_START_MARKER_PATTERN, "")
      .replace(CEA_EXIT_MARKER_PATTERN, "");

    cleanedLines.push(withoutMarkers);
  }

  return cleanedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatTerminalScreen(content: string): string {
  const cleaned = stripInternalMarkers(content);
  if (!cleaned) {
    return "(no visible output)";
  }
  return `${TERMINAL_SCREEN_PREFIX}\n${cleaned}\n${TERMINAL_SCREEN_SUFFIX}`;
}

export function formatSystemReminder(message: string): string {
  return `${SYSTEM_REMINDER_PREFIX} ${message}`;
}

export interface TimeoutMessageOptions {
  timeoutMs: number;
  terminalScreen: string;
  sessionId?: string;
}

export function formatTimeoutMessage(options: TimeoutMessageOptions): string;
export function formatTimeoutMessage(
  timeoutMs: number,
  terminalScreen: string,
  sessionId?: string
): string;
export function formatTimeoutMessage(
  optionsOrTimeoutMs: TimeoutMessageOptions | number,
  terminalScreen?: string,
  sessionId?: string
): string {
  let timeoutMs: number;
  let screen: string;
  let session: string | undefined;

  if (typeof optionsOrTimeoutMs === "object") {
    timeoutMs = optionsOrTimeoutMs.timeoutMs;
    screen = optionsOrTimeoutMs.terminalScreen;
    session = optionsOrTimeoutMs.sessionId;
  } else {
    timeoutMs = optionsOrTimeoutMs;
    screen = terminalScreen ?? "";
    session = sessionId;
  }

  const formattedScreen = formatTerminalScreen(screen);

  const detectionResults = detectInteractivePrompt({
    terminalContent: screen,
    sessionId: session,
  });

  if (detectionResults.length > 0) {
    const detectionInfo = formatDetectionResults(detectionResults);
    return `${detectionInfo}\n\n${formattedScreen}`;
  }

  const timeoutHeader = `${TIMEOUT_PREFIX} Command timed out after ${timeoutMs}ms. The process may still be running.`;

  const possibleCauses = [
    "• The command is still executing (long-running process)",
    "• The process is waiting for input not detected by pattern matching",
    "• The process is stuck or hanging",
  ];

  const suggestedActions = [
    "• Use shell_interact('<Ctrl+C>') to interrupt",
    "• Use shell_interact('<Enter>') if it might be waiting for confirmation",
    "• Check the terminal screen above for any prompts or messages",
    "• If the process should continue, increase timeout_ms parameter",
  ];

  const reminder = [
    "[POSSIBLE CAUSES]",
    ...possibleCauses,
    "",
    "[SUGGESTED ACTIONS]",
    ...suggestedActions,
  ].join("\n");

  return `${timeoutHeader}\n\n${formattedScreen}\n\n${reminder}`;
}

export function formatBackgroundMessage(terminalScreen: string): string {
  const screen = formatTerminalScreen(terminalScreen);
  const reminder = formatSystemReminder(
    "The process is running in the background. Use shell_interact to check status or send signals."
  );
  return `${BACKGROUND_PREFIX}\n\n${screen}\n\n${reminder}`;
}
