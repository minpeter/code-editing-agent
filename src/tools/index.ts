import { editFileTool } from "./edit-file";
import { listFilesTool } from "./list-files";
import { readFileTool } from "./read-file";

export const tools = {
  read_file: readFileTool,
  list_files: listFilesTool,
  edit_file: editFileTool,
} as const;
