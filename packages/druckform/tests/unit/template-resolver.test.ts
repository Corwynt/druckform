import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

function makeTempTemplates(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-test-"));
  // base template with infobox
  const baseDir = path.join(dir, "base");
  fs.mkdirSync(path.join(baseDir, "components"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "template.yaml"),
    `
name: base
description: Base template
components:
  infobox:
    source: components/infobox.component.yaml
`,
  );
  fs.writeFileSync(
    path.join(baseDir, "components", "infobox.component.yaml"),
    `
name: infobox
description: An info box
params:
  title: { type: string, required: true }
  accent: { type: token, required: false, default: accentColor }
slots:
  children: true
emits: |
  \\begin{infobox}{{{accent}}}{{{title}}}
  {{children}}
  \\end{infobox}
`,
  );
  // report template that extends base with a partial override
  const reportDir = path.join(dir, "report");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, "template.yaml"),
    `
name: report
extends: base
components:
  infobox:
    extends: base.infobox
    defaults:
      accent: warningColor
`,
  );
  return dir;
}

describe("resolveTemplate", () => {
  it("resolves a base template with no parent", async () => {
    const dir = makeTempTemplates();
    const all = loadAllTemplates(dir);
    const resolved = await resolveTemplate("base", all);
    expect(resolved.name).toBe("base");
    expect(resolved.extendsChain).toEqual(["base"]);
    expect(resolved.components).toHaveProperty("infobox");
  });

  it("inherits components from parent template", async () => {
    const dir = makeTempTemplates();
    const all = loadAllTemplates(dir);
    const resolved = await resolveTemplate("report", all);
    expect(resolved.extendsChain).toEqual(["base", "report"]);
    expect(resolved.components).toHaveProperty("infobox");
  });

  it("merges defaults in type-a partial override", async () => {
    const dir = makeTempTemplates();
    const all = loadAllTemplates(dir);
    const resolved = await resolveTemplate("report", all);
    expect(resolved.components.infobox?.defaults.accent).toBe("warningColor");
  });

  it("merges template style down the extends chain (child wins per key)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-style-"));
    fs.mkdirSync(path.join(dir, "base"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "base", "template.yaml"),
      "name: base\ncomponents: {}\nstyle:\n  tokens:\n    colors:\n      accent: \"#111111\"\n      warning: \"#222222\"\n",
    );
    fs.mkdirSync(path.join(dir, "child"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "child", "template.yaml"),
      "name: child\nextends: base\ncomponents: {}\nstyle:\n  tokens:\n    colors:\n      accent: \"#999999\"\n",
    );
    const resolved = await resolveTemplate("child", loadAllTemplates(dir));
    expect(resolved.style?.tokens.colors?.accent).toBe("#999999"); // child overrides
    expect(resolved.style?.tokens.colors?.warning).toBe("#222222"); // inherited from base
  });

  it("throws on circular inheritance", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-circ-"));
    fs.mkdirSync(path.join(dir, "a"), { recursive: true });
    fs.writeFileSync(path.join(dir, "a", "template.yaml"), "name: a\nextends: b\ncomponents: {}");
    fs.mkdirSync(path.join(dir, "b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "b", "template.yaml"), "name: b\nextends: a\ncomponents: {}");
    const all = loadAllTemplates(dir);
    await expect(resolveTemplate("a", all)).rejects.toThrow("Circular");
  });
});
