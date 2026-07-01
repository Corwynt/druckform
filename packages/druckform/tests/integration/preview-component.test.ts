import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Don't run tectonic in tests.
vi.mock("../../src/latex/tectonic.js", () => ({
  runTectonic: vi.fn().mockReturnValue({ ok: true, log: "" }),
}));

import {
  previewComponentCommand,
  synthesizeComponentDoc,
} from "../../src/commands/preview-component.js";

const OUT = path.join(import.meta.dirname, "../../dist/test-preview.pdf");

describe("synthesizeComponentDoc", () => {
  it("uses meta.example verbatim when no params/children are given", () => {
    expect(
      synthesizeComponentDoc("infobox", {}, undefined, ':::infobox{title="Note"}\nx\n:::'),
    ).toBe(':::infobox{title="Note"}\nx\n:::');
  });
  it("builds a fenced block from params + children (default container)", () => {
    expect(synthesizeComponentDoc("infobox", { title: "Hi" }, "Body", undefined)).toBe(
      ':::infobox{title="Hi"}\nBody\n:::\n',
    );
  });
  it("synthesizes an inline directive for form=inline", () => {
    expect(synthesizeComponentDoc("badge", { tone: "warn" }, "NEW", undefined, "inline")).toBe(
      ':badge[NEW]{tone="warn"}\n',
    );
  });
  it("synthesizes an inline directive with empty content when nothing is given", () => {
    expect(synthesizeComponentDoc("badge", {}, undefined, undefined, "inline")).toBe(":badge[]\n");
  });
  it("synthesizes a leaf directive for form=leaf", () => {
    expect(synthesizeComponentDoc("figure", { src: "c.pdf" }, "A cat", undefined, "leaf")).toBe(
      '::figure[A cat]{src="c.pdf"}\n',
    );
  });
});

describe("preview-component", () => {
  it("renders the named component (status ok) via the base template", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    await previewComponentCommand(
      "base",
      "infobox",
      '{"title":"Hi"}',
      "Body",
      undefined,
      OUT,
      true,
      false,
    );
    expect(JSON.parse(writes.join("")).status).toBe("ok");
    vi.restoreAllMocks();
  });

  it("rejects block:/document targets with guidance", async () => {
    const errs: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      errs.push(String(s));
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(
      previewComponentCommand(
        "base",
        "block:table",
        undefined,
        undefined,
        undefined,
        OUT,
        true,
        false,
      ),
    ).rejects.toThrow("exit");
    expect(JSON.parse(errs.join("")).status).toBe("error");
    vi.restoreAllMocks();
  });

  it("exits with error when the component name does not exist in the template", async () => {
    const errs: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      errs.push(String(s));
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(
      previewComponentCommand(
        "base",
        "nonexistent-component",
        undefined,
        undefined,
        undefined,
        OUT,
        true,
        false,
      ),
    ).rejects.toThrow("exit");
    const out = JSON.parse(errs.join(""));
    expect(out.status).toBe("error");
    expect(out.error.summary).toContain("nonexistent-component");
    vi.restoreAllMocks();
  });
});
