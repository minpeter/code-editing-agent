import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { tool } from "ai";
import { z } from "zod";

const inputSchema = z.object({
  path: z.string().describe("The path to the file"),
  old_str: z
    .string()
    .describe(
      "Text to search for - must match exactly and must only have one match exactly"
    ),
  new_str: z.string().describe("Text to replace old_str with"),
});

export const editFileTool = tool({
  description:
    "Make edits to a text file.\n\n" +
    "Replaces 'old_str' with 'new_str' in the given file.\n" +
    "'old_str' and 'new_str' MUST be different from each other.\n\n" +
    "If the file specified with path doesn't exist, it will be created.",
  inputSchema,
  execute: async ({ path, old_str, new_str }: z.infer<typeof inputSchema>) => {
    if (!path || old_str === new_str) {
      throw new Error("Invalid input parameters");
    }

    let content: string;

    try {
      content = await readFile(path, "utf-8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT" &&
        old_str === ""
      ) {
        const dir = dirname(path);
        if (dir !== ".") {
          await mkdir(dir, { recursive: true });
        }
        await writeFile(path, new_str, "utf-8");
        return `Successfully created file ${path}`;
      }
      throw error;
    }

    if (old_str !== "" && !content.includes(old_str)) {
      throw new Error("old_str not found in file");
    }

    const newContent = content.replace(old_str, new_str);

    if (content === newContent && old_str !== "") {
      throw new Error("old_str not found in file");
    }

    await writeFile(path, newContent, "utf-8");
    return "OK";
  },
});
