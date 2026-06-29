import path from "node:path";
import { loadComponent } from "../component/loader.js";
import type { ResolvedComponentEntry, ResolvedTemplate, StyleConfig } from "../sdk/types.js";
import { mergeStyle } from "../style/merge.js";
import type { TemplateEntry } from "./loader.js";

export async function resolveTemplate(
  name: string,
  allTemplates: Map<string, TemplateEntry>,
): Promise<ResolvedTemplate> {
  // 1. Linearize the inheritance chain
  const chain = linearize(name, allTemplates);
  const rootName = chain[0];
  if (!rootName) throw new Error(`Empty inheritance chain for: ${name}`);
  const rootEntry = allTemplates.get(rootName);
  if (!rootEntry) throw new Error(`Template not found: ${rootName}`);

  // 2. Walk chain from root to leaf, merging components
  const mergedComponents = new Map<
    string,
    { sourcePath: string; defaults: Record<string, string> }
  >();

  let mergedStyle: StyleConfig | undefined;

  for (const tplName of chain) {
    const entry = allTemplates.get(tplName);
    if (!entry) throw new Error(`Template not found in chain: ${tplName}`);

    if (entry.config.style) mergedStyle = mergeStyle(mergedStyle, entry.config.style);

    for (const [compName, override] of Object.entries(entry.config.components ?? {})) {
      if (override === null) {
        // Tombstone — remove an inherited component from this point in the chain.
        mergedComponents.delete(compName);
        continue;
      }
      if (override.source) {
        // Total override or new component — replaces parent entirely
        const sourcePath = path.resolve(entry.dir, override.source);
        mergedComponents.set(compName, {
          sourcePath,
          defaults: override.defaults ?? {},
        });
      } else if (override.extends) {
        // Type-a partial override: merge defaults only, keep parent source
        const existing = mergedComponents.get(compName);
        if (!existing) throw new Error(`Component ${compName} extends unknown parent`);
        mergedComponents.set(compName, {
          sourcePath: existing.sourcePath,
          defaults: { ...existing.defaults, ...(override.defaults ?? {}) },
        });
      }
      // else: component not mentioned = inherited as-is
    }
  }

  // 3. Load all component defs
  const components: Record<string, ResolvedComponentEntry> = {};
  await Promise.all(
    [...mergedComponents.entries()].map(async ([compName, { sourcePath, defaults }]) => {
      const def = await loadComponent(sourcePath, "");
      components[compName] = { def, defaults };
    }),
  );

  const leafEntry = allTemplates.get(name);
  if (!leafEntry) throw new Error(`Template not found: ${name}`);

  return {
    name,
    ...(leafEntry.config.description !== undefined
      ? { description: leafEntry.config.description }
      : {}),
    origin: leafEntry.origin,
    extendsChain: chain,
    ...(mergedStyle ? { style: mergedStyle } : {}),
    components,
  };
}

function linearize(name: string, allTemplates: Map<string, TemplateEntry>): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = name;

  while (current) {
    if (visited.has(current)) {
      throw new Error(`Circular template inheritance detected: ${[...chain, current].join(" → ")}`);
    }
    visited.add(current);
    chain.unshift(current); // prepend so chain goes root → leaf
    const entry = allTemplates.get(current);
    if (!entry) throw new Error(`Template not found: ${current}`);
    current = entry.config.extends;
  }

  return chain;
}
