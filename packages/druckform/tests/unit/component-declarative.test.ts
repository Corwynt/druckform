import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadDeclarativeComponent } from "../../src/component/declarative.js";
import type { RenderCtx } from "../../src/sdk/types.js";

// We test against a fixture YAML — create it inline using a temp approach
import fs from "node:fs";
import os from "node:os";

function makeTempYaml(content: string): string {
  const tmp = path.join(os.tmpdir(), `test-comp-${Date.now()}.component.yaml`);
  fs.writeFileSync(tmp, content, "utf8");
  return tmp;
}

const ctx: RenderCtx = {
  token: (name) => `\\druck${name.charAt(0).toUpperCase() + name.slice(1)}`,
  style: { colors: {}, fonts: {}, spacing: {} },
  frontmatter: {},
  templateDir: "/test/template",
  asset: (ref) => path.resolve("/test/template", ref),
};

describe("loadDeclarativeComponent", () => {
  it("loads a minimal string-param component", () => {
    const p = makeTempYaml(`
name: box
description: A simple box
params:
  title: { type: string, required: true }
emits: |
  \\begin{box}{{{title}}}
  \\end{box}
`);
    const def = loadDeclarativeComponent(p);
    expect(def.meta.name).toBe("box");
    expect(def.meta.acceptsChildren).toBe(false);
    const output = def.render({ title: "Hello & World" }, "", ctx);
    expect(output).toContain("Hello \\& World");
  });

  it("resolves token params to style macros", () => {
    const p = makeTempYaml(`
name: colorbox
description: Colored box
params:
  accent: { type: token, required: false, default: accentColor }
emits: "\\\\color{{{accent}}}{content}"
`);
    const def = loadDeclarativeComponent(p);
    expect(def.requiredTokens.has("accentColor")).toBe(true);
    const output = def.render({}, "", ctx);
    expect(output).toContain("\\druckAccentColor");
  });

  it("passes children through raw for acceptsChildren components", () => {
    const p = makeTempYaml(`
name: section
description: A section
params:
  title: { type: string, required: true }
slots:
  children: true
emits: |
  \\begin{section}{{{title}}}
  {{children}}
  \\end{section}
`);
    const def = loadDeclarativeComponent(p);
    expect(def.meta.acceptsChildren).toBe(true);
    const output = def.render({ title: "Test" }, "\\textbf{body}", ctx);
    expect(output).toContain("\\textbf{body}");
  });
});
