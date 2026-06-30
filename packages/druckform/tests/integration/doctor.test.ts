import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { doctorCommand } from "../../src/commands/doctor.js";

function capture(): { writes: string[]; exits: number[]; restore: () => void } {
  const writes: string[] = [];
  const exits: number[] = [];
  const w = vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    writes.push(String(s));
    return true;
  });
  const e = vi.spyOn(process, "exit").mockImplementation((n) => {
    exits.push(n ?? 0);
    throw new Error("exit");
  });
  return {
    writes,
    exits,
    restore: () => {
      w.mockRestore();
      e.mockRestore();
    },
  };
}

describe("druck doctor", () => {
  it("reports ok for the bundled base template", async () => {
    const { writes, restore } = capture();
    await doctorCommand("base", true);
    const out = JSON.parse(writes.join(""));
    expect(out.schemaVersion).toBe("1");
    expect(out.ok).toBe(true);
    expect(out.findings).toEqual([]);
    restore();
  });

  it("flags a declarative emits slot that matches no param", async () => {
    const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
    process.env.DRUCKFORM_TEMPLATES_DIR = USER;
    const { writes, restore } = capture();
    await expect(doctorCommand("badslot", true)).rejects.toThrow("exit");
    const out = JSON.parse(writes.join(""));
    expect(out.ok).toBe(false);
    expect(
      out.findings.some((f: { message: string }) =>
        /unknown slot '\{\{titel\}\}'/i.test(f.message),
      ),
    ).toBe(true);
    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
    restore();
  });

  it("warns when a TS component uses a token it does not declare", async () => {
    const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
    process.env.DRUCKFORM_TEMPLATES_DIR = USER;
    const { writes, restore } = capture();
    await expect(doctorCommand("tokendrift", true)).rejects.toThrow("exit");
    const out = JSON.parse(writes.join(""));
    expect(out.findings.some((f: { message: string }) => /token 'warning'/.test(f.message))).toBe(
      true,
    );
    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
    restore();
  });

  it("errors when a document override omits the body marker", async () => {
    const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
    process.env.DRUCKFORM_TEMPLATES_DIR = USER;
    const { writes, restore } = capture();
    await expect(doctorCommand("nomarker", true)).rejects.toThrow("exit");
    const out = JSON.parse(writes.join(""));
    expect(
      out.findings.some((f: { message: string }) => /body marker|DRUCKFORM_BODY/.test(f.message)),
    ).toBe(true);
    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
    restore();
  });

  it("converts a throwing document-shell probe into a finding instead of crashing", async () => {
    const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
    process.env.DRUCKFORM_TEMPLATES_DIR = USER;
    const { writes, exits, restore } = capture();
    await expect(doctorCommand("throwingdoc", true)).rejects.toThrow("exit");
    const out = JSON.parse(writes.join(""));
    expect(out.ok).toBe(false);
    expect(exits[0]).toBe(1);
    expect(
      out.findings.some(
        (f: { severity: string; component: string; message: string }) =>
          f.severity === "error" &&
          f.component === "document" &&
          /threw during probe/i.test(f.message),
      ),
    ).toBe(true);
    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
    restore();
  });
});
