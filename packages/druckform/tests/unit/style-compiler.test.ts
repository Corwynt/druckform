import { describe, expect, it } from "vitest";
import type { StyleConfig } from "../../src/sdk/types.js";
import { compileStyle, tokenMacro } from "../../src/style/compiler.js";

const minimalConfig: StyleConfig = {
  $schema: "style-v1",
  tokens: {
    colors: { accent: "#2E5AAC", warning: "#B26A00" },
    fonts: { main: "TeX Gyre Pagella", mono: "JetBrains Mono" },
    spacing: { blockGap: "0.8em" },
  },
};

describe("compileStyle", () => {
  it("emits \\definecolor for each color token", () => {
    const preamble = compileStyle(minimalConfig);
    expect(preamble).toContain("\\definecolor{druckAccent}{HTML}{2E5AAC}");
    expect(preamble).toContain("\\definecolor{druckWarning}{HTML}{B26A00}");
  });

  it("emits \\setmainfont and \\setmonofont", () => {
    const preamble = compileStyle(minimalConfig);
    expect(preamble).toContain("\\setmainfont{TeX Gyre Pagella}");
    expect(preamble).toContain("\\setmonofont{JetBrains Mono}");
  });

  it("emits \\newlength + \\setlength for spacing tokens", () => {
    const preamble = compileStyle(minimalConfig);
    expect(preamble).toContain("\\newlength{\\druckBlockGap}");
    expect(preamble).toContain("\\setlength{\\druckBlockGap}{0.8em}");
  });

  it("handles empty tokens gracefully", () => {
    const config: StyleConfig = { $schema: "style-v1", tokens: {} };
    expect(() => compileStyle(config)).not.toThrow();
  });
});

describe("tokenMacro", () => {
  it("returns the LaTeX macro name for a token", () => {
    expect(tokenMacro("accent")).toBe("\\druckAccent");
    expect(tokenMacro("blockGap")).toBe("\\druckBlockGap");
  });
});

describe("compileStyle fonts", () => {
  it("emits a bare \\setmainfont for the string form", () => {
    const cfg: StyleConfig = { $schema: "style-v1", tokens: { fonts: { main: "Noto Sans" } } };
    const out = compileStyle(cfg);
    expect(out).toContain("\\setmainfont{Noto Sans}");
    expect(out).not.toContain("\\setmainfont{Noto Sans}[");
  });

  it("emits fontspec options for the object form", () => {
    const cfg: StyleConfig = {
      $schema: "style-v1",
      tokens: { fonts: { main: { name: "Noto Sans", options: "AutoFakeBold=2.2" } } },
    };
    const out = compileStyle(cfg);
    expect(out).toContain("\\setmainfont{Noto Sans}[AutoFakeBold=2.2]");
  });

  it("supports the object form for mono too", () => {
    const cfg: StyleConfig = {
      $schema: "style-v1",
      tokens: { fonts: { mono: { name: "JetBrains Mono", options: "Scale=0.9" } } },
    };
    const out = compileStyle(cfg);
    expect(out).toContain("\\setmonofont{JetBrains Mono}[Scale=0.9]");
  });
});
