import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { shouldIgnorePath } from "../utils/file-safety";

async function walkDirectory(dir: string, baseDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(baseDir, fullPath);

    const shouldIgnore = await shouldIgnorePath(relPath);
    if (shouldIgnore) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(`${relPath}/`);
      const subFiles = await walkDirectory(fullPath, baseDir);
      files.push(...subFiles);
    } else {
      files.push(relPath);
    }
  }

  return files;
}

export const listFilesTool = tool({
  description:
    "List files and directories at a given path. " +
    "If no path is provided, lists files in the current directory. " +
    "Files matching .gitignore patterns are automatically excluded.",
  inputSchema: z.object({
    path: z
      .string()
      .optional()
      .describe(
        "Optional relative path to list files from. " +
          "Defaults to current directory if not provided."
      ),
  }),
  execute: async ({ path }) => {
    const dir = path || ".";
    const files = await walkDirectory(dir, dir);
    return JSON.stringify(files);
  },
});
