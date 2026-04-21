import { readFileSync } from "node:fs";

const DOTENV_LINE_START =
  /^(?:export\s+)?(?<key>[\w.-]+)\s*=\s*(?<valueStart>.*)$/;
const LINE_BREAK = /\r?\n/;

const decodeQuotedValue = (value: string, quote: string): string => {
  if (quote !== '"') {
    return value;
  }

  return value
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll('\\"', '"')
    .replaceAll("\\\\", "\\");
};

const stripInlineComment = (value: string): string => {
  const commentIndex = value.indexOf("#");
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trimEnd();
};

export const parseEnvFile = (content: string): Record<string, string> => {
  const entries: Record<string, string> = {};
  const lines = content.split(LINE_BREAK);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (!(line && !line.startsWith("#"))) {
      continue;
    }

    const match = DOTENV_LINE_START.exec(line);
    const key = match?.groups?.key;
    const valueStart = match?.groups?.valueStart ?? "";
    if (!key) {
      continue;
    }

    const trimmedValue = valueStart.trimStart();
    const quote = trimmedValue[0];
    if (quote === '"' || quote === "'") {
      const valueParts = [trimmedValue.slice(1)];
      while (!valueParts.at(-1)?.endsWith(quote) && index < lines.length - 1) {
        index += 1;
        valueParts.push(lines[index] ?? "");
      }

      const quotedValue = valueParts.join("\n");
      const value = quotedValue.endsWith(quote)
        ? quotedValue.slice(0, -1)
        : quotedValue;
      entries[key] = decodeQuotedValue(value, quote);
      continue;
    }

    entries[key] = stripInlineComment(valueStart).trimStart();
  }

  return entries;
};

export const loadEnvFileCompat = (envPath: string): void => {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
    return;
  }

  const entries = parseEnvFile(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(entries)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};
