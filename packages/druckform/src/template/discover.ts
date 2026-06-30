import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { TemplateEntry } from "./loader.js";

// Derived component name → absolute source path, for files under `<dir>/components/`
// that the template.yaml does not already declare (by name) or reference (by source).
export function discoverComponents(entry: TemplateEntry): Map<string, string> {
  const found = new Map<string, string>();
  const compDir = path.join(entry.dir, "components");
  if (!fs.existsSync(compDir)) return found;

  const explicitNames = new Set(Object.keys(entry.config.components ?? {}));
  const explicitSources = new Set(
    Object.values(entry.config.components ?? {})
      .map((o) => (o?.source ? path.resolve(entry.dir, o.source) : null))
      .filter((p): p is string => p !== null),
  );

  for (const file of fs.readdirSync(compDir)) {
    // Skip hidden files (e.g. .druckform-tmp-*.mjs scratch files created by the TS loader)
    if (file.startsWith(".")) continue;
    const abs = path.join(compDir, file);
    if (!fs.statSync(abs).isFile()) continue;
    if (explicitSources.has(abs)) continue; // already wired explicitly

    let name: string | null = null;
    if (file.endsWith(".component.yaml") || file.endsWith(".yaml") || file.endsWith(".yml")) {
      const parsed = yaml.load(fs.readFileSync(abs, "utf8")) as { name?: string } | null;
      name = parsed?.name ?? null;
    } else if (file.endsWith(".ts") || file.endsWith(".js") || file.endsWith(".mjs")) {
      name = file.replace(/\.[^.]+$/, ""); // filename stem (convention: stem === meta.name)
    }
    if (!name || name.startsWith("block:") || explicitNames.has(name)) continue;
    found.set(name, abs);
  }
  return found;
}
