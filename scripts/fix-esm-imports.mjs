import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export async function fixExtensionlessImports(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await fixExtensionlessImports(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".js")) {
      continue;
    }

    let content = await readFile(fullPath, "utf8");
    let changed = false;

    const fix = (match, prefix, specifier, suffix) => {
      if (specifier.endsWith(".js") || specifier.endsWith(".json")) {
        return match;
      }
      const resolved = resolve(dirname(fullPath), specifier);
      if (existsSync(`${resolved}.js`)) {
        changed = true;
        return `${prefix}${specifier}.js${suffix}`;
      }
      if (existsSync(join(resolved, "index.js"))) {
        changed = true;
        return `${prefix}${specifier}/index.js${suffix}`;
      }
      return match;
    };

    content = content.replace(/(from\s+["'])(\.\.?\/[^"']+)(["'])/g, fix);
    content = content.replace(/(import\s+["'])(\.\.?\/[^"']+)(["'])/g, fix);

    if (changed) {
      await writeFile(fullPath, content);
    }
  }
}

const distDir = resolve(process.argv[2] || "dist");
if (!existsSync(distDir)) {
  console.error(`dist dir not found: ${distDir}`);
  process.exit(1);
}
await fixExtensionlessImports(distDir);
