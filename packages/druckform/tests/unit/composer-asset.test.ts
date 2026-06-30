import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/templates");
const LOGO_DIR = path.join(FIXTURES, "logotheme");
const style: StyleConfig = { $schema: "style-v1", tokens: { colors: { accent: "#111111" } } };
let template: ResolvedTemplate;

beforeAll(async () => {
  template = await resolveTemplate("logotheme", loadAllTemplates(BUNDLED, FIXTURES));
});

describe("composer exposes template assets to the shell", () => {
  it("splices the absolute asset path and template dir into the shell output", () => {
    const { tex } = composeDocument(
      parseMarkdownString("# Hi"),
      template,
      style,
      new Map(),
      "/assets",
    );
    expect(tex).toContain(`% logo=${path.join(LOGO_DIR, "logo.pdf")}`);
    expect(tex).toContain(`% dir=${LOGO_DIR}`);
  });
});
