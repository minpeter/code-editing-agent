import { editFileTool } from "./edit-file";
import { listFilesTool } from "./list-files";
import { readFileTool } from "./read-file";
import { runCommandTool } from "./run-command";

export const tools = {
  read_file: readFileTool,
  list_files: listFilesTool,
  edit_file: editFileTool,
  run_command: runCommandTool,
} as const;
