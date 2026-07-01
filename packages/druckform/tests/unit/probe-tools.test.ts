import { describe, expect, it } from "vitest";
import { formatReport, probeTools } from "../../src/engine/probe-tools.js";

describe("probeTools", () => {
  it("marks each tool found/missing via the injected resolver", () => {
    const resolve = (cmd: string) => (cmd === "tectonic" ? "/usr/local/bin/tectonic" : null);
    const s = probeTools(resolve);
    expect(s.map((x) => x.tool)).toEqual(["tectonic", "rsvg-convert", "mmdc", "java"]);
    expect(s.find((x) => x.tool === "tectonic")).toEqual({
      tool: "tectonic",
      found: true,
      path: "/usr/local/bin/tectonic",
    });
    expect(s.find((x) => x.tool === "mmdc")).toEqual({ tool: "mmdc", found: false });
  });
});

describe("formatReport", () => {
  it("renders a check/cross line per tool with the chosen engine", () => {
    const out = formatReport(
      [
        { tool: "tectonic", found: true, path: "/x/tectonic" },
        { tool: "mmdc", found: false },
      ],
      "docker",
    );
    expect(out).toContain("engine=auto → docker");
    expect(out).toContain("✓ tectonic");
    expect(out).toContain("/x/tectonic");
    expect(out).toContain("✗ mmdc");
    expect(out).toContain("not found");
  });
});
