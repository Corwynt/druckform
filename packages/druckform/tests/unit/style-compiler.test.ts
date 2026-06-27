import { describe, expect, it } from "vitest";
import { compileStyle, tokenMacro } from "../../src/style/compiler.js";
import type { StyleConfig } from "../../src/sdk/types.js";

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
