import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// We can't run tectonic in tests, so mock it
vi.mock("../../src/latex/tectonic.js", () => ({
  runTectonic: vi.fn().mockReturnValue({ ok: true, log: "" }),
}));

import { renderCommand } from "../../src/commands/render.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");
const STYLES = path.resolve(import.meta.dirname, "../../styles/example/style.yaml");

describe("render integration", () => {
  it("produces ok contract for a valid document", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { writes.push(String(s)); return true; });

    const outPdf = path.join(import.meta.dirname, "../../dist/test-output.pdf");

    await renderCommand(
      "base",
      STYLES,
      path.join(FIXTURES, "documents/valid.md"),
      FIXTURES,
      outPdf,
      true, // --json
    );

    const out = JSON.parse(writes.join(""));
    expect(out.schemaVersion).toBe("1");
    expect(out.status).toBe("ok");

    vi.restoreAllMocks();
  });

  it("produces error contract when token coverage fails", async () => {
    // Create a minimal style with no tokens
    const fs = await import("node:fs");
    const os = await import("node:os");
    const emptyStyle = path.join(os.tmpdir(), "empty-style.yaml");
    fs.writeFileSync(emptyStyle, "$schema: style-v1\ntokens: {}", "utf8");

    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { writes.push(String(s)); return true; });
    const exits: number[] = [];
    vi.spyOn(process, "exit").mockImplementation((n) => { exits.push(n ?? 0); throw new Error("exit"); });

    await expect(
      renderCommand(
        "base",
        emptyStyle,
        path.join(FIXTURES, "documents/valid.md"),
        FIXTURES,
        "/tmp/out.pdf",
        true,
      ),
    ).rejects.toThrow("exit");

    const out = JSON.parse(writes.join(""));
    expect(out.schemaVersion).toBe("1");
    expect(out.status).toBe("error");
    expect(exits[0]).toBe(1);

    vi.restoreAllMocks();
    fs.unlinkSync(emptyStyle);
  });
});
