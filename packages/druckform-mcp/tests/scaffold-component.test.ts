import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli-runner.js", () => ({
  newComponent: vi.fn(() => ({ created: ["templates/acme/components/banner.ts"] })),
}));

import { newComponent } from "../src/cli-runner.js";
import { makeScaffoldComponentTool } from "../src/tools/scaffold-component.js";

let savedTemplatesDir: string | undefined;

beforeEach(() => {
  savedTemplatesDir = process.env.DRUCKFORM_TEMPLATES_DIR;
});

afterEach(() => {
  vi.clearAllMocks();
  if (savedTemplatesDir === undefined) {
    Reflect.deleteProperty(process.env, "DRUCKFORM_TEMPLATES_DIR");
  } else {
    process.env.DRUCKFORM_TEMPLATES_DIR = savedTemplatesDir;
  }
});

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeScaffoldComponentTool();
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("scaffold_component", () => {
  it("scaffolds a component and returns the created paths", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = "/tmp/templates";
    const out = await call({ template: "acme", name: "banner", kind: "ts", acceptsChildren: true });
    expect((out.created as string[]).length).toBe(1);
    expect(newComponent).toHaveBeenCalledWith("acme", "banner", "ts", true);
  });

  it("rejects unsafe template or component names", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = "/tmp/templates";
    await expect(call({ template: "acme", name: "../x" })).rejects.toThrow(/invalid/i);
  });

  it("defaults kind to ts and acceptsChildren to false", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = "/tmp/templates";
    await call({ template: "acme", name: "banner" });
    expect(newComponent).toHaveBeenCalledWith("acme", "banner", "ts", false);
  });

  // Finding 1: reserved component names must be rejected at the tool boundary
  it("rejects a name starting with 'block:' as reserved", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = "/tmp/templates";
    await expect(call({ template: "acme", name: "block:heading" })).rejects.toThrow(/reserved/i);
    expect(newComponent).not.toHaveBeenCalled();
  });

  it("rejects the name 'document' as reserved", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = "/tmp/templates";
    await expect(call({ template: "acme", name: "document" })).rejects.toThrow(/reserved/i);
    expect(newComponent).not.toHaveBeenCalled();
  });

  // Finding 2: DRUCKFORM_TEMPLATES_DIR must be set before invoking the runner
  it("errors and does not invoke the runner when DRUCKFORM_TEMPLATES_DIR is unset", async () => {
    Reflect.deleteProperty(process.env, "DRUCKFORM_TEMPLATES_DIR");
    await expect(call({ template: "acme", name: "banner" })).rejects.toThrow(
      /DRUCKFORM_TEMPLATES_DIR/i,
    );
    expect(newComponent).not.toHaveBeenCalled();
  });
});
