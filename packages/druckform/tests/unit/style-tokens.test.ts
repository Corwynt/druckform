import { describe, expect, it } from "vitest";
import { extractRequiredTokens, checkTokenCoverage } from "../../src/style/tokens.js";
import type { ResolvedTemplate, StyleConfig, ComponentDef } from "../../src/sdk/types.js";
import { z } from "zod";

// Minimal ComponentDef factory for test fixtures
function makeComponentDef(requiredTokens: string[]): ComponentDef {
  return {
    meta: { name: "test", description: "", acceptsChildren: false },
    schema: z.object({}),
    jsonSchema: {},
    render: () => "",
    requiredTokens: new Set(requiredTokens),
  };
}

function makeTemplate(
  components: Record<string, string[]>,
): ResolvedTemplate {
  return {
    name: "test-template",
    origin: "bundled",
    extendsChain: [],
    components: Object.fromEntries(
      Object.entries(components).map(([name, tokens]) => [
        name,
        { def: makeComponentDef(tokens), defaults: {} },
      ]),
    ),
  };
}

describe("extractRequiredTokens", () => {
  it("returns an empty set when no components require tokens", () => {
    const template = makeTemplate({ heading: [] });
    expect(extractRequiredTokens(template).size).toBe(0);
  });

  it("collects tokens from a single component", () => {
    const template = makeTemplate({ heading: ["accent", "blockGap"] });
    const required = extractRequiredTokens(template);
    expect(required).toContain("accent");
    expect(required).toContain("blockGap");
    expect(required.size).toBe(2);
  });

  it("merges tokens across multiple components without duplicates", () => {
    const template = makeTemplate({
      heading: ["accent", "blockGap"],
      callout: ["accent", "warning"],
    });
    const required = extractRequiredTokens(template);
    expect(required.size).toBe(3);
    expect(required).toContain("accent");
    expect(required).toContain("blockGap");
    expect(required).toContain("warning");
  });

  it("returns empty set for an empty component map", () => {
    const template = makeTemplate({});
    expect(extractRequiredTokens(template).size).toBe(0);
  });
});

describe("checkTokenCoverage", () => {
  const baseConfig: StyleConfig = {
    $schema: "style-v1",
    tokens: {
      colors: { accent: "#2E5AAC", warning: "#B26A00" },
      fonts: { main: "TeX Gyre Pagella", mono: "JetBrains Mono" },
      spacing: { blockGap: "0.8em" },
    },
  };

  it("returns no findings when all required tokens are provided", () => {
    const template = makeTemplate({ heading: ["accent", "blockGap"] });
    const required = extractRequiredTokens(template);
    const findings = checkTokenCoverage(required, template, baseConfig);
    expect(findings).toHaveLength(0);
  });

  it("returns an error finding for each missing token", () => {
    const template = makeTemplate({ heading: ["accent", "missingToken"] });
    const required = extractRequiredTokens(template);
    const findings = checkTokenCoverage(required, template, baseConfig);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("missingToken");
    expect(findings[0].component).toBe("heading");
  });

  it("reports the correct component for each missing token", () => {
    const template = makeTemplate({
      heading: ["accent"],
      callout: ["ghostColor"],
    });
    const required = extractRequiredTokens(template);
    const findings = checkTokenCoverage(required, template, baseConfig);
    expect(findings).toHaveLength(1);
    expect(findings[0].component).toBe("callout");
    expect(findings[0].message).toContain("ghostColor");
  });

  it("recognises fontMain and fontMono as available when fonts are configured", () => {
    const template = makeTemplate({ heading: ["fontMain", "fontMono"] });
    const required = extractRequiredTokens(template);
    const findings = checkTokenCoverage(required, template, baseConfig);
    expect(findings).toHaveLength(0);
  });

  it("returns findings for fontMain/fontMono when fonts are absent", () => {
    const configNoFonts: StyleConfig = {
      $schema: "style-v1",
      tokens: { colors: { accent: "#000000" } },
    };
    const template = makeTemplate({ heading: ["fontMain"] });
    const required = extractRequiredTokens(template);
    const findings = checkTokenCoverage(required, template, configNoFonts);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("fontMain");
  });

  it("returns no findings for empty required set", () => {
    const template = makeTemplate({ heading: [] });
    const required = extractRequiredTokens(template);
    const findings = checkTokenCoverage(required, template, baseConfig);
    expect(findings).toHaveLength(0);
  });
});
