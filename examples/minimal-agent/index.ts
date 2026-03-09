import {
  type AgentConfig,
  type AgentStreamResult,
  createAgent,
  MessageHistory,
  type ModelMessage,
  SessionManager,
} from "@ai-sdk-tool/harness";
import { emitEvent, runHeadless } from "@ai-sdk-tool/headless";
import { createAgentTUI } from "@ai-sdk-tool/tui";

interface CliArgs {
  headless: boolean;
  help: boolean;
  prompt?: string;
}

const HELP_TEXT = `Minimal Agent Example

Usage:
  bun run examples/minimal-agent/index.ts [--headless] [--prompt <text>] [--help]

Flags:
  --help              Show this help message
  --headless          Run in headless JSONL mode
  --prompt <text>     User prompt for headless mode

Examples:
  bun run examples/minimal-agent/index.ts
  bun run examples/minimal-agent/index.ts --headless --prompt "Hello"
`;

function parseArgs(argv: string[]): CliArgs {
  let help = false;
  let headless = false;
  let prompt: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--headless") {
      headless = true;
      continue;
    }

    if (arg === "--prompt") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        prompt = next;
        i += 1;
      }
    }
  }

  return { help, headless, prompt };
}

function getLastUserText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") {
      continue;
    }

    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      const text = message.content
        .filter((part): part is { type: "text"; text: string } => {
          return (
            typeof part === "object" &&
            part !== null &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string"
          );
        })
        .map((part) => part.text)
        .join(" ")
        .trim();

      if (text.length > 0) {
        return text;
      }
    }
  }

  return "";
}

function createEchoStreamResult(messages: ModelMessage[]): AgentStreamResult {
  const userText = getLastUserText(messages);
  const echoed = userText.length > 0 ? userText : "(empty input)";
  const reply = `Echo: ${echoed}`;

  const fullStream = new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue({ type: "text-delta", text: reply });
      controller.enqueue({ type: "finish-step", finishReason: "stop" });
      controller.close();
    },
  });

  return {
    fullStream: fullStream as unknown as AgentStreamResult["fullStream"],
    finishReason: Promise.resolve("stop") as AgentStreamResult["finishReason"],
    response: Promise.resolve({
      id: "minimal-agent-response",
      timestamp: new Date(),
      modelId: "mock-echo-model",
      messages: [{ role: "assistant", content: reply }],
    } as unknown) as AgentStreamResult["response"],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const messageHistory = new MessageHistory();
  const sessionManager = new SessionManager("minimal-agent");
  const sessionId = sessionManager.initialize();

  const baseAgent = createAgent({
    model: {} as AgentConfig["model"],
    instructions: "You are a minimal echo agent.",
  });

  const echoAgent = {
    config: baseAgent.config,
    stream: (messages: unknown[]): Promise<AgentStreamResult> => {
      return Promise.resolve(
        createEchoStreamResult(messages as ModelMessage[])
      );
    },
  };

  if (args.headless) {
    const prompt = args.prompt?.trim();
    if (!prompt) {
      console.error("--headless mode requires --prompt <text>");
      process.exitCode = 1;
      return;
    }

    emitEvent({
      timestamp: new Date().toISOString(),
      type: "user",
      sessionId,
      content: prompt,
    });
    messageHistory.addUserMessage(prompt);

    await runHeadless({
      sessionId,
      emitEvent,
      getModelId: () => "mock-echo-model",
      messageHistory,
      maxIterations: 1,
      stream: (messages) => echoAgent.stream(messages as ModelMessage[]),
    });
    return;
  }

  await createAgentTUI({
    agent: echoAgent,
    messageHistory,
    header: {
      title: "Minimal Agent",
      subtitle: `Session: ${sessionId}`,
    },
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
