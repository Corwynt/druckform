import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
let userDir: string | null = null;

afterEach(() => {
  if (userDir) fs.rmSync(userDir, { recursive: true, force: true });
  userDir = null;
});

function writeUserTemplate(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-tpl-"));
  const tdir = path.join(dir, "mytpl");
  fs.mkdirSync(tdir);
  fs.writeFileSync(path.join(tdir, "template.yaml"), yaml, "utf8");
  return dir;
}

describe("reserved block: namespace", () => {
  it("rejects a user template that defines a non-builtin block: component", () => {
    const dir = writeUserTemplate(
      'name: mytpl\nextends: base\ncomponents:\n  "block:fancy":\n    source: x.ts\n',
    );
    userDir = dir;
    expect(() => loadAllTemplates(BUNDLED, dir)).toThrow(/reserved 'block:' namespace/);
  });

  it("allows a user template to override a known built-in block component", () => {
    const dir = writeUserTemplate(
      'name: mytpl\nextends: base\ncomponents:\n  "block:table":\n    source: x.ts\n',
    );
    userDir = dir;
    expect(() => loadAllTemplates(BUNDLED, dir)).not.toThrow();
  });
});
