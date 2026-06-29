import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// tectonic is unavailable/slow in tests — mock it.
vi.mock("../../src/latex/tectonic.js", () => ({
  runTectonic: vi.fn().mockReturnValue({ ok: true, log: "" }),
}));

import { renderCommand } from "../../src/commands/render.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");
const OUT = path.join(import.meta.dirname, "../../dist/test-fm-output.pdf");

function capture(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const w = vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    writes.push(String(s));
    return true;
  });
  const e = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exit");
  });
  // Restore only these spies — leave the module-level runTectonic mock intact.
  return {
    writes,
    restore: () => {
      w.mockRestore();
      e.mockRestore();
    },
  };
}

describe("template selection from frontmatter", () => {
  it("uses the template named in frontmatter when no --template is given", async () => {
    const { writes, restore } = capture();
    await renderCommand(
      undefined, // no --template
      undefined, // no --style
      path.join(FIXTURES, "documents/frontmatter-template.md"),
      FIXTURES,
      OUT,
      true,
    );
    expect(JSON.parse(writes.join("")).status).toBe("ok");
    restore();
  });

  it("lets an explicit --template override a (bogus) frontmatter template", async () => {
    const { writes, restore } = capture();
    await renderCommand(
      "base", // explicit arg overrides frontmatter's "does-not-exist"
      undefined,
      path.join(FIXTURES, "documents/frontmatter-bad-template.md"),
      FIXTURES,
      OUT,
      true,
    );
    expect(JSON.parse(writes.join("")).status).toBe("ok");
    restore();
  });

  it("errors when neither --template nor frontmatter provides a template", async () => {
    const { writes, restore } = capture();
    await expect(
      renderCommand(undefined, undefined, path.join(FIXTURES, "documents/valid.md"), FIXTURES, OUT, true),
    ).rejects.toThrow("exit");
    expect(JSON.parse(writes.join("")).status).toBe("error");
    restore();
  });

  it("errors when the named template does not exist", async () => {
    const { writes, restore } = capture();
    await expect(
      renderCommand(undefined, undefined, path.join(FIXTURES, "documents/frontmatter-bad-template.md"), FIXTURES, OUT, true),
    ).rejects.toThrow("exit");
    expect(JSON.parse(writes.join("")).status).toBe("error");
    restore();
  });
});
