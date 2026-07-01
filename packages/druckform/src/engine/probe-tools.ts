import { spawnSync } from "node:child_process";

export interface ToolStatus {
  tool: string;
  found: boolean;
  path?: string;
}

/** External tools druck shells out to during a render. */
const TOOLS = ["tectonic", "rsvg-convert", "mmdc", "java"] as const;

/** Default PATH resolver (macOS/Linux). Windows support is deferred. */
function whichSync(cmd: string): string | null {
  const res = spawnSync("which", [cmd], { encoding: "utf8" });
  if (res.status === 0 && typeof res.stdout === "string") {
    return res.stdout.trim().split("\n")[0] || null;
  }
  return null;
}

export function probeTools(resolve: (cmd: string) => string | null = whichSync): ToolStatus[] {
  return TOOLS.map((tool) => {
    const found = resolve(tool);
    return found ? { tool, found: true, path: found } : { tool, found: false };
  });
}

export function formatReport(statuses: ToolStatus[], engine: "local" | "docker"): string {
  const missing = statuses.some((s) => !s.found);
  const header = `druck: engine=auto → ${engine}${engine === "docker" && missing ? " (missing tools below)" : ""}`;
  const lines = statuses.map((s) =>
    s.found ? `  ✓ ${s.tool.padEnd(14)} ${s.path}` : `  ✗ ${s.tool.padEnd(14)} not found`,
  );
  return [header, ...lines].join("\n");
}
