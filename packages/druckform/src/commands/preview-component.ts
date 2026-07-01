import fs from "node:fs";
import path from "node:path";
import { parseMarkdownString } from "../parse/parser.js";
import type { RenderContract } from "../sdk/types.js";
import { mergeStyle } from "../style/merge.js";
import { loadStyle } from "../style/validate.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";
import { renderToFile } from "./render.js";

// When compiled individually (source/tests): src/commands/ → ../../templates = druckform/templates
// When bundled into dist/cli.js:              dist/        → ../templates   = druckform/templates
const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1)
  ? _t1
  : path.resolve(new URL("../templates", import.meta.url).pathname);

export function synthesizeComponentDoc(
  name: string,
  params: Record<string, string>,
  children: string | undefined,
  example: string | undefined,
  form: "inline" | "leaf" | "container" = "container",
): string {
  // No overrides and the component ships an example → render it verbatim.
  if (Object.keys(params).length === 0 && children === undefined && example) {
    return example;
  }
  const attrStr = Object.entries(params)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  // Synthesize the directive in the SAME form the component actually fires in, so
  // the preview exercises the real render path (inline rule vs block parser), not
  // always a container fence.
  if (form === "inline") {
    // Inline must sit within a line and be followed by `[`/`{`; always include `[…]`.
    const attrs = attrStr ? `{${attrStr}}` : "";
    return `:${name}[${children ?? ""}]${attrs}\n`;
  }
  if (form === "leaf") {
    const content = children !== undefined ? `[${children}]` : "";
    const attrs = attrStr ? `{${attrStr}}` : "";
    return `::${name}${content}${attrs}\n`;
  }
  // container (default) — body between fences
  return `:::${name}{${attrStr}}\n${children ?? ""}\n:::\n`;
}

function emit(contract: RenderContract, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else if (contract.status === "ok") {
    console.log(`✓ preview written to ${contract.pdf}`);
  } else {
    console.error(`✗ ${contract.error?.summary}`);
    for (const f of contract.error?.findings ?? []) {
      console.error(`  [${f.severity}] ${f.component}${f.line ? `:${f.line}` : ""}: ${f.message}`);
    }
  }
}

export async function previewComponentCommand(
  template: string,
  name: string,
  paramsJson: string | undefined,
  children: string | undefined,
  stylePath: string | undefined,
  outPdf: string,
  json: boolean,
  watch: boolean,
): Promise<void> {
  if (name.startsWith("block:") || name === "document") {
    emit(
      {
        schemaVersion: "1",
        status: "error",
        pdf: null,
        error: {
          summary: `'${name}' is renderer-internal; preview it by rendering a Markdown snippet with 'druck render'.`,
          findings: [],
        },
      },
      json,
    );
    process.exit(1);
  }

  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env.DRUCKFORM_TEMPLATES_DIR);
  const fail = (summary: string) => {
    emit(
      { schemaVersion: "1", status: "error", pdf: null, error: { summary, findings: [] } },
      json,
    );
    process.exit(1);
  };
  if (!all.has(template)) fail(`Template not found: '${template}'`);

  const resolved = await resolveTemplate(template, all);
  const entry = resolved.components[name];
  if (!entry) fail(`Component '${name}' not found in template '${template}'`);

  const params = (paramsJson ? JSON.parse(paramsJson) : {}) as Record<string, string>;
  const md = synthesizeComponentDoc(
    name,
    params,
    children,
    entry?.def.meta.example,
    entry?.def.meta.form ?? "container",
  );

  const externalStyle = stylePath ? loadStyle(stylePath) : undefined;
  const styleConfig = mergeStyle(resolved.style, externalStyle);
  const assetsDir = stylePath ? path.dirname(stylePath) : process.cwd();

  const renderOnce = async (): Promise<RenderContract> => {
    const doc = parseMarkdownString(md);
    return renderToFile(doc, resolved, styleConfig, assetsDir, outPdf, assetsDir);
  };

  const contract = await renderOnce();
  emit(contract, json);

  if (!watch) {
    if (contract.status === "error") process.exit(1);
    return;
  }

  // --watch: re-render when files under the user templates dir (or bundled) change.
  // (recursive fs.watch is supported on macOS/Windows; on Linux it may be shallow.)
  const watchDir = process.env.DRUCKFORM_TEMPLATES_DIR ?? BUNDLED_TEMPLATES;
  console.error(`watching ${watchDir} … (Ctrl-C to stop)`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  fs.watch(watchDir, { recursive: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void renderOnce().then((c) => emit(c, json));
    }, 150);
  });
}
