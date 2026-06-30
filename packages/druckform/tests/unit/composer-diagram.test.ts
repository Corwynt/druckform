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

describe("composer diagram substitution", () => {
  it("substitutes a diagram fence with the rendered PDF (no leaked placeholder)", () => {
    const doc = parseMarkdownString("Intro\n\n```mermaid\ngraph TD; A-->B\n```\n");
    const fence = "```mermaid\ngraph TD; A-->B\n```";
    const diagramMap = new Map<string, string>([[fence, "/tmp/mermaid-0.pdf"]]);

    const { tex } = composeDocument(doc, template, style, diagramMap, "/a");

    expect(tex).toContain("\\includegraphics[width=\\linewidth]{/tmp/mermaid-0.pdf}");
    // The internal placeholder must not survive into the output (raw or LaTeX-escaped).
    expect(tex).not.toMatch(/DRUCKFORM\\?_?DIAGRAM/);
  });

  it("substitutes multiple diagrams independently", () => {
    const doc = parseMarkdownString(
      "```mermaid\ngraph TD; A-->B\n```\n\nmiddle\n\n```mermaid\ngraph TD; C-->D\n```\n",
    );
    const fence0 = "```mermaid\ngraph TD; A-->B\n```";
    const fence1 = "```mermaid\ngraph TD; C-->D\n```";
    const diagramMap = new Map<string, string>([
      [fence0, "/tmp/mermaid-0.pdf"],
      [fence1, "/tmp/mermaid-1.pdf"],
    ]);

    const { tex } = composeDocument(doc, template, style, diagramMap, "/a");

    expect(tex).toContain("{/tmp/mermaid-0.pdf}");
    expect(tex).toContain("{/tmp/mermaid-1.pdf}");
    expect(tex).not.toMatch(/DRUCKFORM\\?_?DIAGRAM/);
  });
});
