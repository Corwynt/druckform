import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newComponent, newTemplate } from "../../src/commands/scaffold.js";
import type { ResolvedTemplate } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "df-new-"));
  process.env.DRUCKFORM_TEMPLATES_DIR = root;
});
afterEach(() => {
  process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");

describe("druck new → auto-discovery", () => {
  it("a scaffolded component is registered without editing template.yaml", async () => {
    newTemplate({ name: "acme", extends: "base" });
    newComponent({ template: "acme", name: "banner", kind: "ts", acceptsChildren: true });
    const resolved: ResolvedTemplate = await resolveTemplate(
      "acme",
      loadAllTemplates(BUNDLED, root),
    );
    expect(resolved.components.banner).toBeDefined();
    expect(resolved.components.infobox).toBeDefined(); // still inherits base
  });

  it("newComponent rejects block: prefixed names", () => {
    newTemplate({ name: "acme2", extends: "base" });
    expect(() =>
      newComponent({ template: "acme2", name: "block:foo", kind: "ts", acceptsChildren: false }),
    ).toThrow(/reserved/i);
  });

  it("newComponent rejects 'document' name", () => {
    newTemplate({ name: "acme3", extends: "base" });
    expect(() =>
      newComponent({ template: "acme3", name: "document", kind: "ts", acceptsChildren: false }),
    ).toThrow(/reserved/i);
  });
});
