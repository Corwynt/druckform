import type { Finding, SourceMap } from "../sdk/types.js";

// Tectonic log line patterns for errors
const ERROR_LINE_RE = /^(?:error|!).*?(?:line|l\.)\s*(\d+)/im;
const UNDEFINED_RE = /undefined control sequence.*?\\(\w+)/i;

export function mapErrors(log: string, sourceMap: SourceMap): Finding[] {
  const findings: Finding[] = [];
  const lines = log.split("\n");

  for (const line of lines) {
    const lineMatch = ERROR_LINE_RE.exec(line);
    if (!lineMatch) continue;

    const texLine = parseInt(lineMatch[1]!, 10);
    const entry = sourceMap.get(texLine);

    const undefMatch = UNDEFINED_RE.exec(line);
    const message = undefMatch
      ? `Undefined LaTeX command: \\${undefMatch[1]}`
      : line.trim();

    findings.push({
      severity: "error",
      component: entry?.componentName ?? "unknown",
      message,
      ...(entry !== undefined ? { line: entry.sourceLine } : {}),
    });
  }

  // Deduplicate by message + component
  return findings.filter(
    (f, i, arr) =>
      arr.findIndex((g) => g.message === f.message && g.component === f.component) === i,
  );
}

export function summarizeFinding(findings: Finding[]): string {
  const first = findings[0];
  if (!first) return "LaTeX compilation failed";
  const loc = first.line !== undefined ? ` (line ${first.line})` : "";
  return `${first.component}${loc}: ${first.message}`;
}
