import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseDocument } from "../../src/parse/parser.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import type { StyleConfig } from "../../src/sdk/types.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
const DOC = path.resolve(import.meta.dirname, "../fixtures/documents/gfm-kitchensink.md");
const style: StyleConfig = { $schema: "style-v1", tokens: { colors: { accent: "#111111" } } };

describe("document shell override (TS)", () => {
  it("uses the overriding template's shell while keeping engine core and GFM body", async () => {
    const all = loadAllTemplates(BUNDLED, USER);
    const template = await resolveTemplate("customdoc", all);
    const { tex } = composeDocument(parseDocument(DOC), template, style, new Map(), USER);

    // custom shell applied
    expect(tex).toContain("%CUSTOMDOC");
    expect(tex).toContain("\\usepackage[a4paper]{geometry}");
    // engine core still composer-injected (non-overridable)
    expect(tex.startsWith("\\documentclass{article}")).toBe(true);
    expect(tex).toContain("\\usepackage[normalem]{ulem}");
    // GFM body still renders through the shell
    expect(tex).toContain("\\section{Heading 1}");
    expect(tex).toContain("\\begin{tabularx}");
    expect(tex).not.toContain("DRUCKFORM_BODY");
  });
});
