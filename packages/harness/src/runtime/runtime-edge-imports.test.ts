import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRYPOINT = join(SOURCE_ROOT, "subpath/runtime.ts");
const MINIMAL_AGENT_ROOT = resolve(SOURCE_ROOT, "../../minimal-agent");

const STATIC_IMPORT_RE =
  /^\s*(?:import(?!\s+type)(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']|export\s+(?!type)(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["'])/gm;

const resolveRelativeSource = (
  fromFile: string,
  specifier: string
): string | null => {
  const basePath = resolve(dirname(fromFile), specifier);
  const candidates = [`${basePath}.ts`, join(basePath, "index.ts")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const collectRuntimeStaticGraph = (): Map<string, string[]> => {
  const graph = new Map<string, string[]>();
  const pending = [ENTRYPOINT];

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || graph.has(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    const specifiers: string[] = [];
    for (const match of content.matchAll(STATIC_IMPORT_RE)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) {
        continue;
      }
      specifiers.push(specifier);
      if (specifier.startsWith(".")) {
        const resolvedPath = resolveRelativeSource(filePath, specifier);
        if (resolvedPath?.startsWith(SOURCE_ROOT)) {
          pending.push(resolvedPath);
        }
      }
    }

    graph.set(filePath, specifiers);
  }

  return graph;
};

describe("runtime edge import graph", () => {
  it("does not statically import Node built-ins from the runtime subpath", () => {
    const graph = collectRuntimeStaticGraph();
    const offenders = [...graph.entries()].flatMap(([filePath, specifiers]) =>
      specifiers
        .filter((specifier) => specifier.startsWith("node:"))
        .map(
          (specifier) =>
            `${filePath.slice(SOURCE_ROOT.length + 1)} -> ${specifier}`
        )
    );

    expect(offenders).toEqual([]);
  });

  it("imports the runtime through browser conditions without process globals", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--conditions=@ai-sdk-tool/source",
        "--conditions=browser",
        "--import",
        "tsx",
        "--eval",
        `
const originalProcess = globalThis.process;
Reflect.deleteProperty(globalThis, "process");
const mod = await import("@ai-sdk-tool/harness/runtime");
const runtime = await mod.createAgentRuntime({
  name: "edge-smoke",
  cwd: "/",
  agents: [
    mod.defineAgent({
      name: "bot",
      agent: { model: {}, instructions: "hi" },
    }),
  ],
});
const session = await runtime.openSession();
await runtime.close();
globalThis.process = originalProcess;
if (!session.sessionId.startsWith("edge-smoke-")) {
  throw new Error(session.sessionId);
}
console.log("browser-condition-ok");
`,
      ],
      {
        cwd: MINIMAL_AGENT_ROOT,
        encoding: "utf8",
      }
    );

    expect(output.trim()).toBe("browser-condition-ok");
  });
});
