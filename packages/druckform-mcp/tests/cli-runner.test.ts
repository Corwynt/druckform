import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  doctorTemplate,
  listComponents,
  listTemplates,
  newComponent,
  newTemplate,
  previewComponent,
  renderDocument,
} from "../src/cli-runner.js";

// Point DRUCK_BIN at the built druckform CLI
beforeAll(() => {
  const druckBin = path.resolve(import.meta.dirname, "../../../packages/druckform/dist/cli.js");
  process.env.DRUCK_BIN = `node ${druckBin}`;
});

let tmp: string | null = null;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("cli-runner", () => {
  it("listTemplates returns schemaVersion 1 and at least one template", () => {
    const result = listTemplates();
    expect(result.schemaVersion).toBe("1");
    expect(result.templates.length).toBeGreaterThan(0);
  });

  it("listComponents returns components for the base template", () => {
    const result = listComponents("base");
    expect(result.schemaVersion).toBe("1");
    expect(result.template).toBe("base");
    expect(result.components.some((c) => c.name === "infobox")).toBe(true);
  });

  it("previewComponent returns an error contract for a block: component name (no tectonic needed)", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-runner-pc-"));
    // Using a block: prefixed name triggers a validation/lookup error before tectonic runs
    const result = previewComponent(
      "base",
      "block:nonexistent",
      undefined,
      undefined,
      path.join(tmp, "out.pdf"),
    );
    expect(result.status).toBe("error");
    expect(result.error?.summary).toBeTruthy();
  });

  it("renderDocument returns an error contract (not a throw) when no template resolves", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-runner-"));
    const inFile = path.join(tmp, "doc.md");
    fs.writeFileSync(inFile, "# No template here\n", "utf8");
    // No --template arg and no frontmatter template → render errors before tectonic.
    const result = renderDocument(undefined, undefined, inFile, tmp, path.join(tmp, "out.pdf"));
    expect(result.status).toBe("error");
    expect(result.error?.summary).toBeTruthy();
  });

  it("doctorTemplate returns a LintContract for the base template", () => {
    const result = doctorTemplate("base");
    expect(result.schemaVersion).toBe("1");
    expect(typeof result.ok).toBe("boolean");
  });

  it("newComponent scaffolds into DRUCKFORM_TEMPLATES_DIR", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-new-"));
    // a minimal user template to scaffold into
    fs.mkdirSync(path.join(tmp, "acme", "components"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "acme", "template.yaml"),
      "name: acme\nextends: base\ncomponents: {}\n",
      "utf8",
    );
    const prev = process.env.DRUCKFORM_TEMPLATES_DIR;
    process.env.DRUCKFORM_TEMPLATES_DIR = tmp;
    try {
      const result = newComponent("acme", "banner", "ts", true);
      expect(result.created.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(tmp, "acme", "components", "banner.ts"))).toBe(true);
    } finally {
      process.env.DRUCKFORM_TEMPLATES_DIR = prev;
    }
  });

  it("newTemplate scaffolds a new template directory into DRUCKFORM_TEMPLATES_DIR", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-new-tpl-"));
    const prev = process.env.DRUCKFORM_TEMPLATES_DIR;
    process.env.DRUCKFORM_TEMPLATES_DIR = tmp;
    try {
      const result = newTemplate("mytemplate", "base");
      expect(result.created.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(tmp, "mytemplate", "template.yaml"))).toBe(true);
    } finally {
      process.env.DRUCKFORM_TEMPLATES_DIR = prev;
    }
  });
});
