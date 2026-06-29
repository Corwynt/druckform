import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";
import { mergeStyle } from "../../src/style/merge.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
let template: ResolvedTemplate;

beforeAll(async () => {
  template = await resolveTemplate("base", loadAllTemplates(BUNDLED));
});

describe("style-in-template", () => {
  it("uses the template's declared style when no external style is given", () => {
    const styleConfig = mergeStyle(template.style, undefined);
    const { tex } = composeDocument(
      parseMarkdownString("Hello"),
      template,
      styleConfig,
      new Map(),
      "/assets",
    );
    expect(tex).toContain("\\definecolor{druckAccent}{HTML}{2E5AAC}");
  });

  it("lets an external style override the template's tokens", () => {
    const external: StyleConfig = {
      $schema: "style-v1",
      tokens: { colors: { accent: "#ABCDEF" } },
    };
    const styleConfig = mergeStyle(template.style, external);
    const { tex } = composeDocument(
      parseMarkdownString("Hello"),
      template,
      styleConfig,
      new Map(),
      "/assets",
    );
    expect(tex).toContain("\\definecolor{druckAccent}{HTML}{ABCDEF}");
    expect(tex).not.toContain("2E5AAC");
  });
});
