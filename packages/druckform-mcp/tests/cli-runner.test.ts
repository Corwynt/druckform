import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { listTemplates, listComponents } from "../src/cli-runner.js";

// Point DRUCK_BIN at the built druckform CLI
beforeAll(() => {
  const druckBin = path.resolve(
    import.meta.dirname,
    "../../../packages/druckform/dist/cli.js",
  );
  process.env["DRUCK_BIN"] = `node ${druckBin}`;
});

describe("cli-runner", () => {
  it("listTemplates returns schemaVersion 1 and at least one template", () => {
    const result = listTemplates();
    expect(result.schemaVersion).toBe("1");
    expect(result.templates.length).toBeGreaterThan(0);
  });

  it("listComponents returns components for the base template", () => {
    const result = listComponents("base");
    expect(result.schemaVersion).toBe("1");
    expect(result.template).toBe("base");
    expect(result.components.some((c) => c.name === "infobox")).toBe(true);
  });
});
