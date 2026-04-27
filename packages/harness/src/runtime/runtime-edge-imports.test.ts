import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRYPOINT = join(SOURCE_ROOT, "subpath/runtime.ts");

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
});
