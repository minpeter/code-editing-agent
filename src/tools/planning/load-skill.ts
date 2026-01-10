import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "ai";
import { z } from "zod";

const SKILLS_DIR = ".claude/skills";

const inputSchema = z.object({
  skillName: z
    .string()
    .min(1)
    .describe("Name of the skill to load (e.g., 'git-workflow')"),
});

export type LoadSkillInput = z.infer<typeof inputSchema>;

export async function executeLoadSkill({
  skillName,
}: LoadSkillInput): Promise<string> {
  const cwd = process.cwd();
  const skillPath = join(cwd, SKILLS_DIR, `${skillName}.md`);

  try {
    const content = await readFile(skillPath, "utf-8");
    return `# Skill Loaded: ${skillName}\n\n${content}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return `Error: Skill '${skillName}' not found. Available skills can be found in ${SKILLS_DIR}/`;
    }
    throw error;
  }
}

export const loadSkillTool = tool({
  description:
    "Load detailed skill documentation when you need specialized knowledge for a task. Skills provide comprehensive workflows, command references, and best practices for specific domains like git operations, testing, deployment, etc.",
  inputSchema,
  execute: executeLoadSkill,
});
