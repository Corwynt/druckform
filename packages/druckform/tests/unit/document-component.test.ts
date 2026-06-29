import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import type { DocumentLayout } from "../../src/sdk/types.js";

const DOC = path.resolve(import.meta.dirname, "../../templates/base/components/document.ts");
const ctx = {
  token: (n: string) => `\\${n}`,
  style: { colors: {}, fonts: {}, spacing: {} },
  frontmatter: {},
};

const layout: DocumentLayout = {
  kind: "document",
  documentclass: "article",
  stylePreamble: "%STYLE",
  componentPreamble: "%COMPONENTS",
  frontmatter: {},
};

describe("default document shell component", () => {
  it("emits the body marker, begin/end document, and splices the preambles", async () => {
    const def = await loadComponent(DOC, "");
    const out = def.render({}, "", ctx, layout);
    expect(out).toContain("DRUCKFORM_BODY");
    expect(out).toContain("\\begin{document}");
    expect(out).toContain("\\end{document}");
    expect(out).toContain("%STYLE");
    expect(out).toContain("%COMPONENTS");
  });

  it("does NOT emit documentclass or engine packages (composer-injected)", async () => {
    const def = await loadComponent(DOC, "");
    const out = def.render({}, "", ctx, layout);
    expect(out).not.toContain("\\documentclass");
    expect(out).not.toContain("\\usepackage{fontspec}");
  });
});
