import { createInterface } from "node:readline/promises";
import { createFriendli } from "@friendliai/ai-provider";
import { ToolLoopAgent } from "ai";
import { env } from "./env";
import { renderFullStream } from "./interaction/stream-renderer";
import { wrapModel } from "./model/create-model";
import { SYSTEM_PROMPT } from "./prompts/system";
import { tools } from "./tools";

const DEFAULT_MODEL_ID = "LGAI-EXAONE/K-EXAONE-236B-A23B";

const friendli = createFriendli({
  apiKey: env.FRIENDLI_TOKEN,
});

const agent = new ToolLoopAgent({
  model: wrapModel(friendli(DEFAULT_MODEL_ID)),
  instructions: SYSTEM_PROMPT,
  tools: {
    ...tools,
  },
  providerOptions: {
    friendli: {
      // enable_thinking for hybrid reasoning models
      chat_template_kwargs: {
        enable_thinking: true,
      },
    },
  },
});

const run = async (): Promise<void> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const input = await rl.question("You: ");
      const trimmed = input.trim();
      if (trimmed.length === 0 || trimmed.toLowerCase() === "exit") {
        break;
      }

      const stream = await agent.stream({ prompt: trimmed });
      await renderFullStream(stream.fullStream, { showSteps: false });
    }
  } finally {
    rl.close();
  }
};

run().catch((error: unknown) => {
  throw error instanceof Error ? error : new Error("Failed to run stream.");
});
