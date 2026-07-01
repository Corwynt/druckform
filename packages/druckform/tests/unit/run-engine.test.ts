import { describe, expect, it, vi } from "vitest";
import type { ToolStatus } from "../../src/engine/probe-tools.js";
import { runWithEngine } from "../../src/engine/run.js";

const allFound: ToolStatus[] = [
  { tool: "tectonic", found: true },
  { tool: "rsvg-convert", found: true },
  { tool: "mmdc", found: true },
  { tool: "java", found: true },
];
const missing: ToolStatus[] = [...allFound.slice(0, 3), { tool: "java", found: false }];

describe("runWithEngine", () => {
  it("runs the local handler when engine resolves local (forced)", async () => {
    const local = vi.fn(async () => {});
    const spawn = vi.fn();
    await runWithEngine({
      engineFlag: "local",
      rawArgs: ["render", "--engine", "local", "--in", "d.md", "--out", "o.pdf"],
      paths: { in: "d.md", out: "o.pdf" },
      local,
      deps: { probe: () => allFound, spawn, exit: () => {}, cwd: "/w", env: {} },
    });
    expect(local).toHaveBeenCalledOnce();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("relays to docker (stripping --engine) and exits with its code when auto detects a missing tool", async () => {
    const local = vi.fn(async () => {});
    const spawn = vi.fn(() => ({ status: 0 }) as never);
    const exit = vi.fn();
    await runWithEngine({
      engineFlag: undefined, // auto
      rawArgs: ["render", "--in", "d.md", "--out", "o.pdf"],
      paths: { in: "d.md", out: "o.pdf" },
      local,
      deps: { probe: () => missing, spawn, exit, cwd: "/w", env: {} },
    });
    expect(local).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledOnce();
    const [cmd, args] = spawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("docker");
    expect(args).not.toContain("--engine");
    expect(args.slice(-5)).toEqual(["render", "--in", "d.md", "--out", "o.pdf"]);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
