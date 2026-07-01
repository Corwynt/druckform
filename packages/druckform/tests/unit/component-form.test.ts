import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDeclarativeComponent } from "../../src/component/declarative.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-form-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function yaml(content: string): string {
  const p = path.join(dir, "c.component.yaml");
  fs.writeFileSync(p, content, "utf8");
  return p;
}

describe("component form metadata", () => {
  it("defaults form to container when unspecified", () => {
    const def = loadDeclarativeComponent(yaml("name: box\ndescription: d\nparams: {}\nemits: x\n"));
    expect(def.meta.form).toBe("container");
  });
  it("reads an explicit inline form", () => {
    const def = loadDeclarativeComponent(
      yaml("name: badge\ndescription: d\nform: inline\nparams: {}\nemits: x\n"),
    );
    expect(def.meta.form).toBe("inline");
  });
});
