import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

let dir: string | null = null;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function writeTemplate(name: string, yaml: string, files: Record<string, string>): void {
  const tdir = path.join(dir as string, name);
  fs.mkdirSync(path.join(tdir, "components"), { recursive: true });
  fs.writeFileSync(path.join(tdir, "template.yaml"), yaml, "utf8");
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tdir, "components", rel), content, "utf8");
  }
}

describe("component auto-discovery", () => {
  it("registers a components/*.ts file with no explicit template.yaml entry", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-disc-"));
    writeTemplate("auto", "name: auto\ncomponents: {}\n", {
      "widget.ts":
        'import { z } from "zod";\nexport const schema = z.object({});\n' +
        'export const meta = { name: "widget", description: "x", acceptsChildren: false };\n' +
        'export function render() { return "\\\\widget"; }\n',
    });
    const resolved = await resolveTemplate("auto", loadAllTemplates(dir));
    expect(resolved.components.widget).toBeDefined();
  });

  it("registers a *.component.yaml by its yaml name field", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-disc-"));
    writeTemplate("auto", "name: auto\ncomponents: {}\n", {
      "box.component.yaml":
        "name: box\ndescription: x\nparams: {}\nslots: { children: true }\nemits: |\n  {{children}}\n",
    });
    const resolved = await resolveTemplate("auto", loadAllTemplates(dir));
    expect(resolved.components.box).toBeDefined();
  });

  it("lets an explicit template.yaml entry win over an auto-discovered file", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-disc-"));
    writeTemplate(
      "auto",
      'name: auto\ncomponents:\n  widget:\n    source: components/widget.ts\n    defaults: { tone: "loud" }\n',
      {
        "widget.ts":
          'import { z } from "zod";\nexport const schema = z.object({ tone: z.string().optional() });\n' +
          'export const meta = { name: "widget", description: "x", acceptsChildren: false };\n' +
          'export function render() { return "\\\\widget"; }\n',
      },
    );
    const resolved = await resolveTemplate("auto", loadAllTemplates(dir));
    expect(resolved.components.widget?.defaults.tone).toBe("loud"); // explicit defaults applied
  });
});
