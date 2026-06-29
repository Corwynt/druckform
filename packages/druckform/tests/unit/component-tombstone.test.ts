import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
let userDir: string | null = null;

afterEach(() => {
  if (userDir) fs.rmSync(userDir, { recursive: true, force: true });
  userDir = null;
});

function writeUserTemplate(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-tomb-"));
  const tdir = path.join(dir, "mytpl");
  fs.mkdirSync(tdir);
  fs.writeFileSync(path.join(tdir, "template.yaml"), yaml, "utf8");
  return dir;
}

describe("component tombstone (null removes an inherited component)", () => {
  it("removes an inherited component set to null", async () => {
    userDir = writeUserTemplate("name: mytpl\nextends: base\ncomponents:\n  infobox: null\n");
    const all = loadAllTemplates(BUNDLED, userDir);
    const resolved = await resolveTemplate("mytpl", all);
    expect(resolved.components.infobox).toBeUndefined();
    // sibling built-ins remain
    expect(resolved.components["block:table"]).toBeDefined();
  });

  it("rejects nulling a built-in block: component at load time", () => {
    const dir = writeUserTemplate(
      'name: mytpl\nextends: base\ncomponents:\n  "block:table": null\n',
    );
    userDir = dir;
    expect(() => loadAllTemplates(BUNDLED, dir)).toThrow(/cannot remove built-in block component/);
  });

  it("still inherits unmentioned components as-is", async () => {
    userDir = writeUserTemplate("name: mytpl\nextends: base\ncomponents: {}\n");
    const resolved = await resolveTemplate("mytpl", loadAllTemplates(BUNDLED, userDir));
    expect(resolved.components.infobox).toBeDefined();
  });
});
