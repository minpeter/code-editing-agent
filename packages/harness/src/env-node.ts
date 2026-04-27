import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFileCompat } from "./env-file";

const findWorkspaceRootEnv = (startDir: string): string | null => {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return resolve(current, ".env");
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

/** Call this only from Node.js entry points (CLI, test harness). Safe to omit in edge runtimes. */
export const loadDotEnvFilesIfAvailable = (startDir = process.cwd()): void => {
  const envFileCandidates = [
    resolve(startDir, ".env"),
    findWorkspaceRootEnv(startDir),
  ].filter((envPath): envPath is string => envPath !== null);

  for (const envPath of new Set(envFileCandidates)) {
    if (existsSync(envPath)) {
      loadEnvFileCompat(envPath);
    }
  }
};
