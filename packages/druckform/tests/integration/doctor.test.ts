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
});
