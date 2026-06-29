import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { TemplateConfig } from "../sdk/types.js";

export interface TemplateEntry {
  config: TemplateConfig;
  dir: string;
  origin: "bundled" | "user";
}

const KNOWN_BLOCK_COMPONENTS = new Set([
  "block:heading",
  "block:blockquote",
  "block:hr",
  "block:image",
  "block:codeblock",
  "block:table",
  "block:list",
]);

export function loadAllTemplates(bundledDir: string, userDir?: string): Map<string, TemplateEntry> {
  const templates = new Map<string, TemplateEntry>();

  for (const origin of ["bundled", "user"] as const) {
    const dir = origin === "bundled" ? bundledDir : userDir;
    if (!dir || !fs.existsSync(dir)) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const templateDir = path.join(dir, entry.name);
      const configPath = path.join(templateDir, "template.yaml");
      if (!fs.existsSync(configPath)) continue;

      const raw = fs.readFileSync(configPath, "utf8");
      const config = yaml.load(raw) as TemplateConfig;
      for (const [compName, spec] of Object.entries(config.components ?? {})) {
        if (compName.startsWith("block:") && spec === null) {
          throw new Error(
            `Template '${config.name}' cannot remove built-in block component '${compName}' (set to null). 'block:' components are required by the Markdown renderer.`,
          );
        }
      }
      if (origin === "user") {
        for (const compName of Object.keys(config.components ?? {})) {
          if (compName.startsWith("block:") && !KNOWN_BLOCK_COMPONENTS.has(compName)) {
            throw new Error(
              `Template '${config.name}' uses the reserved 'block:' namespace for unknown ` +
                `component '${compName}'. Only built-in block components may use this prefix.`,
            );
          }
        }
      }
      templates.set(config.name, { config, dir: templateDir, origin });
    }
  }

  return templates;
}
