const SPECIAL_RE = /[&%_#${}~^\\]/g;

const ESCAPE_MAP: Record<string, string> = {
  "&": "\\&",
  "%": "\\%",
  _: "\\_",
  "#": "\\#",
  $: "\\$",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "\\": "\\textbackslash{}",
};

export function escapeTeX(text: string): string {
  return text.replace(SPECIAL_RE, (ch) => ESCAPE_MAP[ch] ?? ch);
}

/** Raw LaTeX — inserted without escaping. Use only for trusted values (tokens, rendered children). */
export class RawTeX {
  constructor(public readonly value: string) {}
}

export const raw = (value: string) => new RawTeX(value);

/**
 * Tagged template literal that auto-escapes string interpolations.
 * Wrap a value in raw() to skip escaping (for tokens and rendered children).
 *
 * @example
 * Tex`\textbf{${userTitle}}`          // userTitle is escaped
 * Tex`\color{${raw(tokenMacro)}}{}`   // tokenMacro inserted as-is
 */
export function Tex(
  strings: TemplateStringsArray,
  ...values: Array<string | RawTeX>
): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings.raw[i];
    if (i < values.length) {
      const v = values[i];
      out += v instanceof RawTeX ? v.value : escapeTeX(String(v));
    }
  }
  return out;
}
