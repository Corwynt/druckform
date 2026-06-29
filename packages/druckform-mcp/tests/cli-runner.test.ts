import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { listComponents, listTemplates, renderDocument } from "../src/cli-runner.js";

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

  it("renderDocument returns an error contract (not a throw) when no template resolves", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-runner-"));
    const inFile = path.join(tmp, "doc.md");
    fs.writeFileSync(inFile, "# No template here\n", "utf8");
    // No --template arg and no frontmatter template → render errors before tectonic.
    const result = renderDocument(undefined, undefined, inFile, tmp, path.join(tmp, "out.pdf"));
    expect(result.status).toBe("error");
    expect(result.error?.summary).toBeTruthy();
  });
});
