import { tool } from "ai";
import { z } from "zod";
import { safeReadFile } from "../utils/file-safety";

export const readFileTool = tool({
  description:
    "Read the contents of a given relative file path. " +
    "Use this when you want to see what's inside a file. " +
    "Do not use this with directory names. " +
    "Files in .gitignore, binary files, and files over 1MB will be rejected.",
  inputSchema: z.object({
    path: z
      .string()
      .describe("The relative path of a file in the working directory."),
  }),
  execute: async ({ path }) => {
    return await safeReadFile(path);
  },
});
