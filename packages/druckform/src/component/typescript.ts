import fsSync from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tokenRefName } from "../sdk/token-ref.js";
import type { ComponentDef, ComponentMeta } from "../sdk/types.js";

// Monotonic counter ensuring temp filenames are unique even when many components
// in the same directory are bundled concurrently (e.g. resolveTemplate's
// Promise.all), where Date.now() alone collides within a single millisecond.
let tmpCounter = 0;

// Absolute entry paths for the two deps every component may import. They are
// resolved against THIS package so a component in an external
// DRUCKFORM_TEMPLATES_DIR (which cannot resolve upward to our node_modules)
// still bundles them. Everything else stays external (see the plugin below).
const require_ = createRequire(import.meta.url);
const ZOD_ENTRY = require_.resolve("zod");
const _loaderDir = path.dirname(fileURLToPath(import.meta.url));
// src layout: <pkg>/src/component → ../index.ts ; bundled dist: <pkg>/dist → ./index.js
const DRUCKFORM_ENTRY =
  [
    path.resolve(_loaderDir, "../index.ts"),
    path.resolve(_loaderDir, "../index.js"),
    path.resolve(_loaderDir, "index.js"),
  ].find((p) => fsSync.existsSync(p)) ?? path.resolve(_loaderDir, "../index.js");

export async function loadTypeScriptComponent(tsPath: string): Promise<ComponentDef> {
  // Bundle the TS component to a temp ESM file in memory
  const result = await esbuild.build({
    entryPoints: [tsPath],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    target: "node22",
    // Inline zod + druckform (resolved from THIS package); leave all other
    // bare imports external so we don't bundle unrelated node_modules.
    alias: { zod: ZOD_ENTRY, druckform: DRUCKFORM_ENTRY },
    plugins: [
      {
        name: "externalize-non-blessed",
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.kind === "entry-point") return undefined;
            if (
              args.path === "zod" ||
              args.path.startsWith("zod/") ||
              args.path === "druckform" ||
              args.path.startsWith("druckform/")
            ) {
              return undefined; // let alias + normal resolution bundle these
            }
            return { path: args.path, external: true };
          });
        },
      },
    ],
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

    const derivedTokens = new Set<string>();
    for (const field of Object.values(mod.schema.shape ?? {})) {
      const t = tokenRefName(field);
      if (t) derivedTokens.add(t);
    }
    const requiredTokens = new Set([...(mod.meta.requiredTokens ?? []), ...derivedTokens]);

    return {
      meta: { ...mod.meta, form: mod.meta.form ?? "container" },
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
