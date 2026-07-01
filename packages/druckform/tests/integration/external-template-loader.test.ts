import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-ext-tpl-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("external-template TS component loading", () => {
  it("resolves zod and druckform from an external dir with no local node_modules", async () => {
    const src = [
      'import { z, escapeTeX } from "druckform";',
      "export const schema = z.object({ label: z.string() });",
      'export const meta = { name: "ext", description: "external", acceptsChildren: false };',
      "export function render(params) {",
      "  return `\\\\textbf{${escapeTeX(params.label)}}`;",
      "}",
    ].join("\n");
    const tsPath = path.join(dir, "ext.ts");
    fs.writeFileSync(tsPath, src, "utf8");

    // No node_modules exists in `dir` or above it (it's under the OS temp root).
    const def = await loadComponent(tsPath, "");
    const out = def.render({ label: "A&B" }, "", { token: (n) => n } as never, undefined);
    expect(out).toBe("\\textbf{A\\&B}");
  });
});
