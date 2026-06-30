import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import { composeDocument } from "../../src/latex/composer.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { RenderCtx, StyleConfig } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
const FM_ECHO = path.resolve(import.meta.dirname, "../fixtures/components/fm-echo.component.yaml");
const style: StyleConfig = { $schema: "style-v1", tokens: { colors: { accent: "#111111" } } };

describe("frontmatter exposed to components", () => {
  it("substitutes {{fm.<key>}} in a declarative component (escaped)", async () => {
    const def = await loadComponent(FM_ECHO, "");
    const ctx: RenderCtx = {
      token: (n) => `\\${n}`,
      style: { colors: {}, fonts: {}, spacing: {} },
      frontmatter: { title: "A&B" },
      templateDir: "/test/template",
      asset: (ref) => path.resolve("/test/template", ref),
    };
    expect(def.render({}, "", ctx)).toContain("FM:A\\&B");
  });

  it("flows document frontmatter into the document shell payload", async () => {
    const template = await resolveTemplate("fmdoc", loadAllTemplates(BUNDLED, USER));
    const doc = parseMarkdownString("---\ntitle: HelloFM\n---\n# H");
    const { tex } = composeDocument(doc, template, style, new Map(), USER);
    expect(tex).toContain("%FM:HelloFM");
  });
});
