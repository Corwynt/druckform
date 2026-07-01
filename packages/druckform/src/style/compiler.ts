import type { StyleConfig, StyleTokens } from "../sdk/types.js";

export function extractTokens(config: StyleConfig): StyleTokens {
  return {
    colors: config.tokens.colors ?? {},
    fonts: config.tokens.fonts ?? {},
    spacing: config.tokens.spacing ?? {},
  };
}

/**
 * Converts style tokens to a LaTeX preamble fragment.
 * Components reference tokens via \druckNAME macros.
 */
export function compileStyle(config: StyleConfig): string {
  const tokens = extractTokens(config);
  const lines: string[] = ["% === Druckform style preamble ==="];

  // Colors: \definecolor{druckAccent}{HTML}{2E5AAC}
  for (const [name, hex] of Object.entries(tokens.colors)) {
    const macroName = `druck${capitalize(name)}`;
    const hexVal = hex.replace("#", "");
    lines.push(`\\definecolor{${macroName}}{HTML}{${hexVal}}`);
    // Also define a convenience alias macro \druckAccentColor
    lines.push(`\\newcommand{\\${macroName}}{\\color{${macroName}}}`);
  }

  // Fonts (requires fontspec package in document preamble). A font token may be
  // a bare name or { name, options } — options are spliced as \setmainfont{n}[opts]
  // (e.g. AutoFakeBold for variable fonts that lack a selectable Bold instance).
  if (tokens.fonts.main) {
    lines.push(fontCommand("setmainfont", tokens.fonts.main));
  }
  if (tokens.fonts.mono) {
    lines.push(fontCommand("setmonofont", tokens.fonts.mono));
  }

  // Spacing: \newlength{\druckBlockgap}\setlength{\druckBlockgap}{0.8em}
  for (const [name, value] of Object.entries(tokens.spacing)) {
    const macroName = `druck${capitalize(name)}`;
    lines.push(`\\newlength{\\${macroName}}`);
    lines.push(`\\setlength{\\${macroName}}{${value}}`);
  }

  return lines.join("\n");
}

/** Returns the LaTeX macro name for a token, e.g. "accent" → "\\druckAccent" */
export function tokenMacro(name: string): string {
  return `\\druck${capitalize(name)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fontCommand(cmd: string, spec: import("../sdk/types.js").FontSpec): string {
  if (typeof spec === "string") return `\\${cmd}{${spec}}`;
  return spec.options ? `\\${cmd}{${spec.name}}[${spec.options}]` : `\\${cmd}{${spec.name}}`;
}
