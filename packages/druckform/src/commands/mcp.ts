import { spawnSync } from "node:child_process";

export function mcpCommand(): void {
  const result = spawnSync("druckform-mcp", [], {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error("druckform-mcp not found. Install druckform-mcp to use MCP features.");
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}
