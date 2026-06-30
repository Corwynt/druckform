import fs from "node:fs";
import path from "node:path";

export function resolveUserTemplatesDir(): string {
  const dir = process.env.DRUCKFORM_TEMPLATES_DIR ?? path.resolve(process.cwd(), "templates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function newTemplate(opts: { name: string; extends?: string }): {
  dir: string;
  file: string;
} {
  const dir = path.join(resolveUserTemplatesDir(), opts.name);
  fs.mkdirSync(path.join(dir, "components"), { recursive: true });
  const file = path.join(dir, "template.yaml");
  if (fs.existsSync(file)) throw new Error(`Template already exists: ${file}`);
  const ext = opts.extends ? `extends: ${opts.extends}\n` : "";
  fs.writeFileSync(
    file,
    `name: ${opts.name}\ndescription: "TODO: describe ${opts.name}"\n${ext}components: {}\n`,
    "utf8",
  );
  return { dir, file };
}

function tsTemplate(name: string, acceptsChildren: boolean): string {
  const childrenLine = acceptsChildren ? "body\\n" : "";
  const renderBody = acceptsChildren ? "children" : '""';
  return `import type { BlockElement, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "${name}",
  description: "TODO: describe ${name}",
  acceptsChildren: ${acceptsChildren},
  example: "::: ${name}\\n${childrenLine}:::",
};

export function render(
  _params: unknown,
  children: string,
  _ctx: RenderCtx,
  _element?: BlockElement,
): string {
  // TODO: emit LaTeX. \`children\` is pre-rendered (raw); escapeTeX any user strings.
  return ${renderBody};
}
`;
}

function yamlTemplate(name: string, acceptsChildren: boolean): string {
  const emitsBody = acceptsChildren ? "{{children}}" : "% TODO: emit LaTeX";
  return `name: ${name}
description: "TODO: describe ${name}"
params: {}
slots:
  children: ${acceptsChildren}
emits: |
  ${emitsBody}
`;
}

function colocatedTestContent(template: string, name: string, ext: string): string {
  return `import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const FILE = path.resolve(import.meta.dirname, "../../templates/${template}/components/${name}.${ext}");

describe("${name}", () => {
  it("renders", async () => {
    const out = await renderComponent(FILE, {}, { children: "BODY" });
    expect(typeof out).toBe("string");
  });
});
`;
}

const RESERVED_COMPONENT_NAMES = new Set(["document"]);

export function newComponent(opts: {
  template: string;
  name: string;
  kind: "ts" | "yaml";
  acceptsChildren: boolean;
}): { file: string; test?: string } {
  if (opts.name.startsWith("block:")) {
    throw new Error(
      `Component name '${opts.name}' uses the reserved 'block:' prefix. These are built-in GFM block components and cannot be user-scaffolded.`,
    );
  }
  if (RESERVED_COMPONENT_NAMES.has(opts.name)) {
    throw new Error(`Component name '${opts.name}' is reserved and cannot be user-scaffolded.`);
  }
  const tplDir = path.join(resolveUserTemplatesDir(), opts.template);
  if (!fs.existsSync(path.join(tplDir, "template.yaml"))) {
    throw new Error(
      `Template '${opts.template}' not found at ${tplDir} (run: druck new template --name ${opts.template})`,
    );
  }
  const compDir = path.join(tplDir, "components");
  fs.mkdirSync(compDir, { recursive: true });
  const ext = opts.kind === "ts" ? "ts" : "component.yaml";
  const file = path.join(compDir, `${opts.name}.${ext}`);
  if (fs.existsSync(file)) throw new Error(`Component already exists: ${file}`);
  fs.writeFileSync(
    file,
    opts.kind === "ts"
      ? tsTemplate(opts.name, opts.acceptsChildren)
      : yamlTemplate(opts.name, opts.acceptsChildren),
    "utf8",
  );

  // Colocated starter test only when scaffolding inside this repo's bundled templates.
  const repoTemplates = path.resolve(import.meta.dirname, "../../templates");
  let test: string | undefined;
  if (path.resolve(tplDir).startsWith(repoTemplates + path.sep)) {
    test = path.resolve(import.meta.dirname, `../../tests/unit/scaffold-${opts.name}.test.ts`);
    fs.writeFileSync(test, colocatedTestContent(opts.template, opts.name, ext), "utf8");
  }
  return test ? { file, test } : { file };
}
