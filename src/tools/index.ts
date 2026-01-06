import { deleteFileTool } from "./delete-file";
import { editFileTool } from "./edit-file";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { readFileTool } from "./read-file";
import { runCommandTool } from "./run-command";
import { writeFileTool } from "./write-file";

export const tools = {
  // File reading and searching
  read_file: readFileTool,
  glob: globTool,
  grep: grepTool,

  // File manipulation
  write_file: writeFileTool,
  edit_file: editFileTool,
  delete_file: deleteFileTool,

  // Command execution
  run_command: runCommandTool,
} as const;
