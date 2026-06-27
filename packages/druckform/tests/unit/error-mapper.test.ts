import { describe, expect, it } from "vitest";
import { mapErrors, summarizeFinding } from "../../src/latex/error-mapper.js";
import type { SourceMap } from "../../src/sdk/types.js";

describe("mapErrors", () => {
  it("extracts error line number and maps to component", () => {
    const log = "! Undefined control sequence at line 42\n";
    const sourceMap: SourceMap = new Map([
      [42, { componentName: "infobox", sourceLine: 12 }],
    ]);
    const findings = mapErrors(log, sourceMap);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.component).toBe("infobox");
    expect(findings[0]?.line).toBe(12);
  });

  it("falls back to unknown component when not in source map", () => {
    const log = "error: undefined reference at l. 99";
    const findings = mapErrors(log, new Map());
    expect(findings[0]?.component).toBe("unknown");
  });

  it("deduplicates identical findings", () => {
    const log = "! Error at line 5\n! Error at line 5\n";
    const findings = mapErrors(log, new Map());
    expect(findings.length).toBeLessThanOrEqual(1);
  });
});

describe("summarizeFinding", () => {
  it("returns a one-line summary", () => {
    const findings: import("../../src/sdk/types.js").Finding[] = [
      { severity: "error", component: "callout", message: "Missing token", line: 7 },
    ];
    expect(summarizeFinding(findings)).toBe("callout (line 7): Missing token");
  });

  it("handles empty findings", () => {
    expect(summarizeFinding([])).toBe("LaTeX compilation failed");
  });
});
