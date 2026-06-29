import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const style: StyleConfig = { $schema: "style-v1", tokens: { colors: { accent: "#111111" } } };
let template: ResolvedTemplate;

beforeAll(async () => {
  template = await resolveTemplate("base", loadAllTemplates(BUNDLED));
});

describe("composer document shell", () => {
  it("assembles documentclass + engine core + shell in order", () => {
    const { tex } = composeDocument(
      parseMarkdownString("# Title\n\nBody."),
      template,
      style,
      new Map(),
      "/a",
    );
    expect(tex.startsWith("\\documentclass{article}")).toBe(true);
    for (const pkg of [
      "\\usepackage{fontspec}",
      "\\usepackage{xcolor}",
      "\\usepackage{graphicx}",
      "\\usepackage{hyperref}",
      "\\usepackage[normalem]{ulem}",
    ]) {
      expect(tex).toContain(pkg);
    }
    expect(tex).toContain("\\definecolor{druckAccent}{HTML}{111111}"); // style preamble
    expect(tex).toContain("\\begin{document}");
    expect(tex).toContain("\\end{document}");
    expect(tex).not.toContain("DRUCKFORM_BODY"); // marker substituted
  });

  it("rejects ::: document used as a body block", () => {
    const doc = parseMarkdownString("::: document\nx\n:::\n");
    expect(() => composeDocument(doc, template, style, new Map(), "/a")).toThrow(
      /renderer-internal/,
    );
  });

  it("keeps the source map aligned: the body's heading maps to its .md line", () => {
    // Line 1 of the doc is the heading.
    const { tex, sourceMap } = composeDocument(
      parseMarkdownString("# Heading"),
      template,
      style,
      new Map(),
      "/a",
    );
    const texLines = tex.split("\n");
    const headingTexLine = texLines.findIndex((l) => l.includes("\\section{Heading}")) + 1; // 1-based
    expect(headingTexLine).toBeGreaterThan(0);
    expect(sourceMap.get(headingTexLine)?.sourceLine).toBe(1);
  });
});
