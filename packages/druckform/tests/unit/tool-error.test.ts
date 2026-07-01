import { describe, expect, it, vi } from "vitest";
import { missingToolError } from "../../src/engine/tool-error.js";

describe("missingToolError", () => {
  it("names the tool and the docker escape hatch", () => {
    const e = missingToolError("tectonic");
    expect(e.message).toContain("tectonic");
    expect(e.message).toContain("DRUCK_ENGINE=docker");
  });
});

describe("tectonic ENOENT", () => {
  it("throws the guiding error when the tectonic binary is missing", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", () => ({
      spawnSync: () => ({ error: Object.assign(new Error("x"), { code: "ENOENT" }), status: null }),
    }));
    const { runTectonic } = await import("../../src/latex/tectonic.js");
    expect(() => runTectonic("/tmp/doc.tex", "/tmp/out.pdf")).toThrow(
      /tectonic.*DRUCK_ENGINE=docker/s,
    );
    vi.doUnmock("node:child_process");
    vi.resetModules();
  });
});
