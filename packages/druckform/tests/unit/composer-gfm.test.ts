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

describe("composer GFM integration", () => {
  it("emits a table and pulls in tabularx/booktabs/hyperref/ulem packages", () => {
    const doc = parseMarkdownString("| A | B |\n|--|--|\n| 1 | 2 |\n\nSee [link](https://x.com).");
    const { tex } = composeDocument(doc, template, style, new Map(), "/assets");
    expect(tex).toContain("\\begin{tabularx}");
    expect(tex).toContain("\\usepackage{tabularx}");
    expect(tex).toContain("\\usepackage{booktabs}");
    expect(tex).toContain("\\usepackage{hyperref}");
    expect(tex).toContain("\\usepackage[normalem]{ulem}");
    expect(tex).toContain("\\href{https://x.com}{link}");
  });
});
