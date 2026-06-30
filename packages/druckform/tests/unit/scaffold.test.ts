import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newComponent, newTemplate } from "../../src/commands/scaffold.js";
import { renderComponent } from "../helpers/render-component.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "df-scaffold-"));
  process.env.DRUCKFORM_TEMPLATES_DIR = root;
});
afterEach(() => {
  process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scaffolding", () => {
  it("new template creates template.yaml + components dir", () => {
    const { dir, file } = newTemplate({ name: "acme", extends: "base" });
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(path.join(dir, "components"))).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toContain("extends: base");
  });

  it("new component (ts) emits a loadable, renderable component", async () => {
    newTemplate({ name: "acme", extends: "base" });
    const { file } = newComponent({
      template: "acme",
      name: "banner",
      kind: "ts",
      acceptsChildren: true,
    });
    expect(fs.existsSync(file)).toBe(true);
    // the emitted file loads and renders (children passthrough by default)
    const out = await renderComponent(file, {}, { children: "BODY" });
    expect(out).toContain("BODY");
  });

  it("new component (yaml) emits a parseable declarative component", async () => {
    newTemplate({ name: "acme" });
    const { file } = newComponent({
      template: "acme",
      name: "note",
      kind: "yaml",
      acceptsChildren: true,
    });
    const out = await renderComponent(file, {}, { children: "X" });
    expect(out).toContain("X");
  });
});
