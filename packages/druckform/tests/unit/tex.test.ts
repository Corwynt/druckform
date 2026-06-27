import { describe, expect, it } from "vitest";
import { Tex, escapeTeX, raw } from "../../src/sdk/tex.js";

describe("escapeTeX", () => {
  it("escapes all 10 TeX special characters", () => {
    expect(escapeTeX("& % _ # $ { } ~ ^ \\")).toBe(
      "\\& \\% \\_ \\# \\$ \\{ \\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}"
    );
  });

  it("leaves safe text unchanged", () => {
    expect(escapeTeX("hello world 123")).toBe("hello world 123");
  });

  it("handles empty string", () => {
    expect(escapeTeX("")).toBe("");
  });
});

describe("Tex", () => {
  it("escapes interpolated strings", () => {
    const title = "Report & Summary";
    expect(Tex`\textbf{${title}}`).toBe("\\textbf{Report \\& Summary}");
  });

  it("inserts raw() values without escaping", () => {
    const macro = "\\accentcolor";
    expect(Tex`\color{${raw(macro)}}{text}`).toBe("\\color{\\accentcolor}{text}");
  });

  it("handles mixed escaped and raw values", () => {
    const user = "100%";
    const token = "\\warningColor";
    expect(Tex`${user} ${raw(token)}`).toBe("100\\% \\warningColor");
  });
});
