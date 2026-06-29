import path from "node:path";
import esbuild from "esbuild";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ComponentDef, ComponentMeta } from "../sdk/types.js";

// Monotonic counter ensuring temp filenames are unique even when many components
// in the same directory are bundled concurrently (e.g. resolveTemplate's
// Promise.all), where Date.now() alone collides within a single millisecond.
let tmpCounter = 0;

export async function loadTypeScriptComponent(tsPath: string): Promise<ComponentDef> {
  // Bundle the TS component to a temp ESM file in memory
  const result = await esbuild.build({
    entryPoints: [tsPath],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    packages: "external", // don't bundle node_modules
    target: "node22",
  });

  const code = result.outputFiles[0]?.text;
  if (!code) throw new Error(`esbuild produced no output for ${tsPath}`);

  // Write to a temp file and import (data URL import not reliable for all deps).
  // The file is placed next to the original source (not in os.tmpdir()) because
  // bundled code may contain relative imports that are resolved against the
  // file's location — placing it beside the source ensures those paths still
  // resolve correctly.
  const tmpFile = path.join(
    path.dirname(tsPath),
    `.druckform-tmp-${process.pid}-${Date.now()}-${tmpCounter++}.mjs`,
  );
  const fs = await import("node:fs/promises");
  await fs.writeFile(tmpFile, code, "utf8");

  try {
    const mod = (await import(tmpFile)) as {
      schema: z.ZodObject<z.ZodRawShape>;
      meta: ComponentMeta;
      render: (params: unknown, children: string, ctx: unknown, element?: unknown) => string;
      preamble?: string;
    };

    if (!mod.schema || !mod.meta || !mod.render) {
      throw new Error(`Component ${tsPath} must export schema, meta, and render`);
    }

    const jsonSchema =
      zodToJsonSchema(mod.schema, { name: mod.meta.name }).definitions?.[mod.meta.name] ??
      zodToJsonSchema(mod.schema);

    const requiredTokens = new Set(mod.meta.requiredTokens ?? []);

    return {
      meta: mod.meta,
      schema: mod.schema,
      jsonSchema: jsonSchema as Record<string, unknown>,
      render: (params, children, ctx, element) => {
        const validated = mod.schema.parse(params);
        return mod.render(validated, children, ctx, element);
      },
      requiredTokens,
      ...(mod.preamble !== undefined ? { preamble: mod.preamble } : {}),
    };
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}
