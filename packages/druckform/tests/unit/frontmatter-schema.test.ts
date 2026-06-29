import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyFrontmatterDefaults, validateFrontmatter } from "../../src/parse/frontmatter.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

describe("frontmatter schema", () => {
  it("flags a missing required key and passes when present", () => {
    const spec = { title: { required: true }, author: { required: false } };
    expect(validateFrontmatter(spec, {}).length).toBe(1);
    expect(validateFrontmatter(spec, {}).at(0)?.component).toBe("frontmatter");
    expect(validateFrontmatter(spec, { title: "X" })).toEqual([]);
  });

  it("applies defaults, with provided values winning", () => {
    const spec = { date: { default: "today" }, title: { required: true } };
    expect(applyFrontmatterDefaults(spec, { title: "T" })).toEqual({ date: "today", title: "T" });
    expect(applyFrontmatterDefaults(spec, { date: "2026", title: "T" })).toEqual({
      date: "2026",
      title: "T",
    });
  });

  it("merges the frontmatter schema down the extends chain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-fm-"));
    fs.mkdirSync(path.join(dir, "base"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "base", "template.yaml"),
      "name: base\ncomponents: {}\nfrontmatter:\n  title: { required: true }\n",
    );
    fs.mkdirSync(path.join(dir, "child"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "child", "template.yaml"),
      "name: child\nextends: base\ncomponents: {}\nfrontmatter:\n  author: { required: false }\n",
    );
    const resolved = await resolveTemplate("child", loadAllTemplates(dir));
    expect(resolved.frontmatter?.title?.required).toBe(true); // inherited
    expect(resolved.frontmatter?.author).toBeDefined(); // added by child
  });
});
