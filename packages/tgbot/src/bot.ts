import { Chat, type Message, type Thread } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { clearHistory, handleMessage, recordMessage } from "./agent";
import { env } from "./env";

const telegram = createTelegramAdapter({
  mode: "polling",
  userName: env.TELEGRAM_BOT_USERNAME,
});

export const bot = new Chat({
  userName: env.TELEGRAM_BOT_USERNAME ?? "Apex",
  adapters: { telegram },
  state: createRedisState({ url: env.REDIS_URL }),
  onLockConflict: "force",
  logger: "debug",
});

async function registerCommands(): Promise<void> {
  const baseUrl = env.TELEGRAM_API_BASE_URL;
  try {
    const res = await fetch(
      `${baseUrl}/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: [
            { command: "clear", description: "Clear conversation history" },
          ],
        }),
      }
    );
    if (!res.ok) {
      console.error("[tgbot] Failed to register commands:", await res.text());
    }
  } catch (error) {
    console.error("[tgbot] Failed to register commands:", error);
  }
}

export { registerCommands };

const triggerWords = env.TRIGGER_WORDS;
const CLEAR_COMMAND = /^\/clear(@\w+)?$/i;
interface TelegramRawReply {
  reply_to_message?: {
    from?: { id?: number; username?: string; is_bot?: boolean };
  };
}

function isReplyToBot(message: Message): boolean {
  const raw = message.raw as TelegramRawReply | undefined;
  const replyFrom = raw?.reply_to_message?.from;
  if (!replyFrom?.is_bot) {
    return false;
  }
  const botUsername = env.TELEGRAM_BOT_USERNAME;
  if (botUsername && replyFrom.username) {
    return replyFrom.username.toLowerCase() === botUsername.toLowerCase();
  }
  return replyFrom.is_bot === true;
}

function hasTriggerWord(text: string): boolean {
  if (triggerWords.length === 0) {
    return false;
  }
  const lower = text.toLowerCase();
  return triggerWords.some((w) => lower.includes(w));
}

async function respond(thread: Thread): Promise<void> {
  try {
    await thread.startTyping();
    const text = await handleMessage(thread.id);
    try {
      await thread.post({ markdown: text });
    } catch {
      await thread.post(text);
    }
  } catch (error) {
    console.error("[tgbot] Error handling message:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await thread.post(`Error: ${errMsg}`);
  }
}

async function handleIncoming(thread: Thread, message: Message): Promise<void> {
  if (CLEAR_COMMAND.test(message.text ?? "")) {
    clearHistory(thread.id);
    await thread.post(
      "History cleared. Mention me to start a new conversation."
    );
    return;
  }

  recordMessage(thread.id, message.text);

  if (
    message.isMention ||
    hasTriggerWord(message.text) ||
    isReplyToBot(message)
  ) {
    await respond(thread);
  }
}

bot.onNewMention(async (thread, message) => {
  await handleIncoming(thread, message);
});

bot.onSubscribedMessage(async (thread, message) => {
  await handleIncoming(thread, message);
});

bot.onNewMessage(/.*/, async (thread, message) => {
  await handleIncoming(thread, message);
});
