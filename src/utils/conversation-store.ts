import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModelMessage } from "ai";

const CONVERSATIONS_DIR = ".conversations";

export interface ConversationMetadata {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface StoredConversation {
  metadata: ConversationMetadata;
  messages: ModelMessage[];
}

async function ensureConversationsDir(): Promise<string> {
  const dir = join(process.cwd(), CONVERSATIONS_DIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

export async function saveConversation(
  messages: ModelMessage[],
  existingId?: string
): Promise<string> {
  const dir = await ensureConversationsDir();
  const id = existingId ?? generateId();
  const now = new Date().toISOString();

  const stored: StoredConversation = {
    metadata: {
      id,
      createdAt: existingId
        ? ((await loadConversation(id))?.metadata.createdAt ?? now)
        : now,
      updatedAt: now,
      messageCount: messages.length,
    },
    messages,
  };

  const filePath = join(dir, `${id}.json`);
  await writeFile(filePath, JSON.stringify(stored, null, 2));
  return id;
}

export async function loadConversation(
  id: string
): Promise<StoredConversation | null> {
  const dir = await ensureConversationsDir();
  const filePath = join(dir, `${id}.json`);

  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as StoredConversation;
  } catch {
    return null;
  }
}

export async function listConversations(): Promise<ConversationMetadata[]> {
  const dir = await ensureConversationsDir();

  try {
    const files = await readdir(dir);
    const conversations: ConversationMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }

      const filePath = join(dir, file);
      const content = await readFile(filePath, "utf-8");
      const stored = JSON.parse(content) as StoredConversation;
      conversations.push(stored.metadata);
    }

    return conversations.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function deleteConversation(id: string): Promise<boolean> {
  const dir = await ensureConversationsDir();
  const filePath = join(dir, `${id}.json`);

  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
