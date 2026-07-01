import { describe, expect, it } from "vitest";
import type { ToolStatus } from "../../src/engine/probe-tools.js";
import { decideEngine, resolveEngineMode } from "../../src/engine/resolve-engine.js";

describe("resolveEngineMode", () => {
  it("prefers flag over env over default auto", () => {
    expect(resolveEngineMode("docker", "local")).toBe("docker");
    expect(resolveEngineMode(undefined, "local")).toBe("local");
    expect(resolveEngineMode(undefined, undefined)).toBe("auto");
  });
  it("throws on an invalid value", () => {
    expect(() => resolveEngineMode("nonsense")).toThrow(/local \| docker \| auto/);
  });
});

describe("decideEngine", () => {
  const all: ToolStatus[] = [
    { tool: "tectonic", found: true },
    { tool: "rsvg-convert", found: true },
    { tool: "mmdc", found: true },
    { tool: "java", found: true },
  ];
  const someMissing: ToolStatus[] = [...all.slice(0, 3), { tool: "java", found: false }];

  it("forced local/docker skip probing", () => {
    let probed = false;
    const probe = () => {
      probed = true;
      return all;
    };
    expect(decideEngine("local", probe)).toEqual({ engine: "local" });
    expect(decideEngine("docker", probe)).toEqual({ engine: "docker" });
    expect(probed).toBe(false);
  });
  it("auto → local when all tools present", () => {
    expect(decideEngine("auto", () => all)).toEqual({ engine: "local", statuses: all });
  });
  it("auto → docker when any tool missing", () => {
    expect(decideEngine("auto", () => someMissing)).toEqual({
      engine: "docker",
      statuses: someMissing,
    });
  });
});
