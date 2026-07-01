import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { componentsCommand } from "../../src/commands/components.js";

describe("rich list_components", () => {
  it("includes source, acceptsElement, and contractVersion", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    await componentsCommand("base", true);
    vi.restoreAllMocks();
    const out = JSON.parse(writes.join(""));
    const table = out.components.find((c: { name: string }) => c.name === "block:table");
    expect(table.contractVersion).toBe("1");
    expect(table.acceptsElement).toBe(true); // block:table reads `element`
    expect(table.form).toBe("container"); // components default to container form
    expect(typeof table.source).toBe("string");
    expect(table.source).toContain("export const meta");
    const infobox = out.components.find((c: { name: string }) => c.name === "infobox");
    expect(infobox.acceptsElement).toBe(false); // declarative infobox: no element/{{body}}
    expect(infobox.form).toBe("container");
  });
});
